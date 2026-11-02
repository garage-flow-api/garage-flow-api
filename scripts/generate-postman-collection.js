const fs = require('fs');
const src = process.argv[2] || 'docs/openapi.json';
const outFile = process.argv[3] || 'docs/Garage-Flow-API.postman_collection.json';
const o = JSON.parse(fs.readFileSync(src, 'utf8'));
const S = o.components.schemas;
const deref = (s) => (s && s.$ref ? S[s.$ref.split('/').pop()] : s);
function ex(s) {
  s = deref(s);
  if (!s) return null;
  if (s.example !== undefined) return s.example;
  if (s.allOf) return ex(s.allOf[0]);
  if (s.enum) return s.enum[0];
  if (s.type === 'array') return [ex(s.items)];
  if (s.type === 'object' || s.properties) {
    const r = {};
    for (const [k, v] of Object.entries(s.properties || {})) r[k] = ex(v);
    return r;
  }
  if (s.type === 'number' || s.type === 'integer') return 1;
  if (s.type === 'boolean') return true;
  return 'string';
}
const VAR = {
  '/auth/users': 'userId',
  '/services': 'serviceId',
  '/inventory': 'partId',
  '/clients': 'clientId',
  '/vehicles': 'vehicleId',
  '/service-orders': 'serviceOrderId',
};
const pv = (p) => {
  const base = '/' + p.split('/')[1];
  return VAR[base] || 'id';
};
const ev = (lines) => [{ listen: 'test', script: { type: 'text/javascript', exec: lines } }];
const pre = (lines) => ({ listen: 'prerequest', script: { type: 'text/javascript', exec: lines } });
const captureId = (v) => ({
  listen: 'test',
  script: {
    type: 'text/javascript',
    exec: [
      'pm.test("status 2xx",()=>pm.expect(pm.response.code).to.be.within(200,299));',
      `try{const j=pm.response.json(); if(j&&j.id) pm.collectionVariables.set("${v}", j.id);}catch(e){}`,
    ],
  },
});
const okTest = (code = 200) => ({
  listen: 'test',
  script: {
    type: 'text/javascript',
    exec: [`pm.test("status ${code}",()=>pm.response.to.have.status(${code}));`],
  },
});
const jsonHdr = [{ key: 'Content-Type', value: 'application/json' }];
const MECH = new Set([
  '/service-orders/{id}/start-diagnosis',
  '/service-orders/{id}/add-services-and-parts',
  '/service-orders/{id}/start-service',
  '/service-orders/{id}/finish-service',
]);
function req(name, method, path, { body, query, desc, events, noAuth, headers, mech } = {}) {
  const raw = path.replace(/\{(\w+)\}/g, (_, n) =>
    n === 'token'
      ? path.startsWith('/budget-decisions')
        ? '{{decisionToken}}'
        : '{{trackingToken}}'
      : n === 'email'
        ? '{{userEmail}}'
        : `{{${pv(path)}}}`,
  );
  const parts = raw.split('/').filter(Boolean);
  const r = {
    name,
    event: events || [],
    request: {
      method,
      header: [...(body ? jsonHdr : []), ...(headers || [])],
      url: {
        raw:
          '{{baseUrl}}/' +
          parts.join('/') +
          (query ? '?' + query.map((q) => q.key + '=' + q.value).join('&') : ''),
        host: ['{{baseUrl}}'],
        path: parts,
        ...(query ? { query } : {}),
      },
      description: desc || '',
    },
  };
  if (body)
    r.request.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2),
      options: { raw: { language: 'json' } },
    };
  if (noAuth) r.request.auth = { type: 'noauth' };
  if (mech || MECH.has(path))
    r.request.auth = {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{token_mechanic}}', type: 'string' }],
    };
  return r;
}
// ---- generic folders from OpenAPI
const order = [
  'Monitoring',
  'Auth',
  'Services',
  'inventory',
  'Clients',
  'Vehicles',
  'Service Orders',
  'Budget decisions',
  'Webhooks',
];
const folderName = {
  Monitoring: 'Monitoramento',
  Auth: 'Auth e usuários',
  Services: 'Serviços (catálogo)',
  inventory: 'Estoque',
  Clients: 'Clientes',
  Vehicles: 'Veículos',
  'Service Orders': 'Ordens de serviço',
  'Budget decisions': 'Decisão do orçamento (links do e-mail)',
  Webhooks: 'Webhooks',
};
const groups = {};
for (const [p, m] of Object.entries(o.paths))
  for (const [k, op] of Object.entries(m)) {
    const tag = (op.tags || ['Outros'])[0];
    const pub = !op.security;
    let body = null;
    if (op.requestBody) {
      const sc = op.requestBody.content['application/json'].schema;
      body = ex(sc);
    }
    const query = (op.parameters || [])
      .filter((x) => x.in === 'query')
      .map((x) => ({
        key: x.name,
        value: x.example !== undefined ? String(x.example) : '',
        disabled: true,
        description: x.description || '',
      }));
    let events = [];
    const method = k.toUpperCase();
    if (
      method === 'POST' &&
      p !== '/auth/login' &&
      p !== '/webhooks/budget-decision' &&
      VAR['/' + p.split('/')[1]] &&
      p.split('/').length === 2
    ) {
      events = [captureId(pv(p))];
    }
    let name = `${method} ${p}`;
    let headers = [];
    if (p === '/webhooks/budget-decision') {
      body = { serviceOrderId: '{{serviceOrderId}}', decision: 'APPROVED' };
      events = [sigScript(), okTest(200)];
      headers = [{ key: 'X-Signature', value: '{{webhookSignature}}' }];
    }
    if (p === '/auth/login') {
      body = { email: '{{adminEmail}}', password: '{{password}}' };
      events = [loginScript('ADMIN', 'token_admin')];
    }
    if (p === '/auth/users' && method === 'POST') {
      body.email = 'mecanico.{{$timestamp}}@example.com';
      events = [captureId('userId'), pm_user()];
    }
    if (p === '/service-orders' && method === 'POST') {
      body = osBody();
      events = [osCapture()];
    }
    if (p === '/service-orders/{id}/add-services-and-parts')
      body = {
        services: [{ serviceId: '{{serviceId}}' }],
        parts: [{ inventoryId: '{{partId}}', quantity: 2 }],
      };
    if (p === '/services' && method === 'POST') body.name = 'Troca de óleo {{$timestamp}}';
    (groups[tag] = groups[tag] || []).push(
      req(name, method, p, {
        body,
        query: query.length ? query : undefined,
        desc: op.summary
          ? op.summary + (op.description ? '\n\n' + op.description : '')
          : op.description,
        events,
        noAuth: pub,
        headers,
      }),
    );
  }
function pm_user() {
  return {
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: ['try{pm.collectionVariables.set("userEmail", pm.response.json().email);}catch(e){}'],
    },
  };
}
function osBody() {
  return {
    client: {
      cpfCnpj: '529.982.247-25',
      name: 'João da Silva',
      phone: '11999998888',
      address: 'Rua das Flores, 123 - São Paulo/SP',
      email: 'joao@example.com',
    },
    vehicle: { licensePlate: 'ABC1D23', brand: 'Fiat', model: 'Uno', year: 2020 },
    description: 'Barulho ao frear e vibração no volante',
    services: [{ serviceId: '{{serviceId}}' }],
    parts: [{ inventoryId: '{{partId}}', quantity: 1 }],
  };
}
function osCapture() {
  return {
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        'pm.test("OS criada (201)",()=>pm.response.to.have.status(201));',
        'const j=pm.response.json();',
        'pm.collectionVariables.set("serviceOrderId", j.id);',
        'pm.collectionVariables.set("clientId", j.clientId || pm.collectionVariables.get("clientId"));',
        'pm.collectionVariables.set("vehicleId", j.vehicleId);',
        'if(j.trackingLink){pm.collectionVariables.set("trackingToken", j.trackingLink.split("/").pop());}',
      ],
    },
  };
}
function loginScript(role, varName) {
  return {
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        'pm.test("login 200/201",()=>pm.expect(pm.response.code).to.be.oneOf([200,201]));',
        `const t=pm.response.json().access_token; pm.collectionVariables.set("${varName}", t);`,
        `pm.collectionVariables.set("token", t);`,
      ],
    },
  };
}
function sigScript() {
  return pre([
    '// Assina o corpo EXATO enviado: X-Signature = sha256=<HMAC-SHA256(body, BUDGET_WEBHOOK_SECRET)>',
    'const secret = pm.collectionVariables.get("webhookSecret");',
    'const body = pm.variables.replaceIn(pm.request.body.raw);',
    'pm.request.body.update({mode:"raw", raw: body, options:{raw:{language:"json"}}});',
    'const hex = CryptoJS.HmacSHA256(body, secret).toString(CryptoJS.enc.Hex);',
    'pm.variables.set("webhookSignature", "sha256=" + hex);',
  ]);
}
// ---- fluxo guiado
const mk = (n, m, p, opt = {}) => req(n, m, p, opt);
const okT = (c = 200) => okTest(c);
const prep = (pfx) => [
  mk(`${pfx}.1 Abrir OS`, 'POST', '/service-orders', { body: osBody(), events: [osCapture()] }),
  mk(`${pfx}.2 Iniciar diagnóstico (mecânico)`, 'PATCH', '/service-orders/{id}/start-diagnosis', {
    events: [okT()],
  }),
  mk(
    `${pfx}.3 Adicionar serviços e peças (mecânico)`,
    'PATCH',
    '/service-orders/{id}/add-services-and-parts',
    {
      body: {
        services: [{ serviceId: '{{serviceId}}' }],
        parts: [{ inventoryId: '{{partId}}', quantity: 1 }],
      },
      events: [okT()],
    },
  ),
  mk(`${pfx}.4 Gerar orçamento (e-mail com links)`, 'PATCH', '/service-orders/{id}/budget', {
    events: [okT()],
  }),
];
const whReq = (n, d) => {
  const r = req(n, 'POST', '/webhooks/budget-decision', {
    body: { serviceOrderId: '{{serviceOrderId}}', decision: d },
    noAuth: true,
    headers: [{ key: 'X-Signature', value: '{{webhookSignature}}' }],
    events: [
      sigScript(),
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            'pm.test("status 200",()=>pm.response.to.have.status(200));',
            'pm.test("decisão processada",()=>pm.expect(pm.response.json().processed).to.eql(true));',
          ],
        },
      },
    ],
    desc: 'O pré-request calcula X-Signature com a variável webhookSecret (mesmo valor de BUDGET_WEBHOOK_SECRET da API).',
  });
  return r;
};
const lc = [
  mk('1. Cadastrar serviço no catálogo', 'POST', '/services', {
    body: { name: 'Troca de óleo {{$timestamp}}', price: 150 },
    events: [captureId('serviceId')],
  }),
  mk('2. Cadastrar peça no estoque', 'POST', '/inventory', {
    body: {
      name: 'Óleo sintético 5W40 {{$timestamp}}',
      unitOfMeasure: 'ML',
      unitPrice: 59.9,
      quantity: 20,
      minQuantity: 5,
    },
    events: [captureId('partId')],
  }),
  mk('3. Abrir OS (e-mail de recebimento)', 'POST', '/service-orders', {
    body: osBody(),
    events: [osCapture()],
  }),
  mk('4. Consultar status público (sem login)', 'GET', '/service-orders/track/{token}', {
    noAuth: true,
    events: [okT()],
  }),
  mk('5. Iniciar diagnóstico (mecânico)', 'PATCH', '/service-orders/{id}/start-diagnosis', {
    events: [okT()],
  }),
  mk(
    '6. Adicionar serviços e peças (mecânico)',
    'PATCH',
    '/service-orders/{id}/add-services-and-parts',
    {
      body: {
        services: [{ serviceId: '{{serviceId}}' }],
        parts: [{ inventoryId: '{{partId}}', quantity: 2 }],
      },
      events: [okT()],
    },
  ),
  mk(
    '7. Gerar orçamento (e-mail com links de aprovar/recusar)',
    'PATCH',
    '/service-orders/{id}/budget',
    { events: [okT()] },
  ),
  mk('8. Aprovar orçamento', 'PATCH', '/service-orders/{id}/approve-budget', { events: [okT()] }),
  mk('9. Iniciar execução (mecânico)', 'PATCH', '/service-orders/{id}/start-service', {
    events: [okT()],
  }),
  mk(
    '10. Finalizar serviço (mecânico, baixa o estoque)',
    'PATCH',
    '/service-orders/{id}/finish-service',
    { events: [okT()] },
  ),
  mk('11. Entregar', 'PATCH', '/service-orders/{id}/deliver', { events: [okT()] }),
  mk('12. Link de acompanhamento', 'GET', '/service-orders/{id}/tracking-link', {
    events: [okT()],
  }),
  mk('13. Listar OS abertas por prioridade', 'GET', '/service-orders', { events: [okT()] }),
];
const alt = [
  {
    name: 'B1 - Aprovar pelo webhook',
    item: [...prep('B1'), whReq('B1.5 Webhook: APPROVED (assinado)', 'APPROVED')],
  },
  {
    name: 'B2 - Recusar pelo webhook',
    item: [...prep('B2'), whReq('B2.5 Webhook: REJECTED (assinado)', 'REJECTED')],
  },
  {
    name: 'B3 - Cancelar a OS',
    item: [
      mk('B3.1 Abrir OS', 'POST', '/service-orders', { body: osBody(), events: [osCapture()] }),
      mk('B3.2 Cancelar OS', 'PATCH', '/service-orders/{id}/cancel-service', { events: [okT()] }),
    ],
  },
  {
    name: 'B4 - Links do e-mail',
    item: [
      ...prep('B4'),
      mk('B4.5 Abrir confirmação (GET)', 'GET', '/budget-decisions/{token}', {
        noAuth: true,
        desc: 'Antes: abra o Mailpit (http://localhost:8025), copie o token do link do e-mail de orçamento (a parte depois de /budget-decisions/) e cole na variável decisionToken. O GET só mostra a confirmação, não altera a OS.',
      }),
      mk('B4.6 Confirmar decisão (POST)', 'POST', '/budget-decisions/{token}', {
        noAuth: true,
        desc: 'Registra a decisão do link (aprovar ou recusar, conforme o link copiado). A primeira decisão vale.',
      }),
    ],
  },
];
const logins = [
  ['ADMIN', 'adminEmail', 'token_admin'],
  ['SERVICE_ADVISOR', 'advisorEmail', 'token_advisor'],
  ['MECHANIC', 'mechanicEmail', 'token_mechanic'],
  ['STOCK_CLERK', 'stockEmail', 'token_stock'],
].map(([role, em, tv], i) =>
  req(`Login ${role}`, 'POST', '/auth/login', {
    body: { email: `{{${em}}}`, password: '{{password}}' },
    noAuth: true,
    events: [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            'pm.test("login ok",()=>pm.expect(pm.response.code).to.be.oneOf([200,201]));',
            `const t=pm.response.json().access_token; pm.collectionVariables.set("${tv}", t);`,
            ...(i === 0 ? ['pm.collectionVariables.set("token", t);'] : []),
          ],
        },
      },
    ],
  }),
);
const col = {
  info: {
    name: 'Garage Flow API',
    description:
      'Collection gerada do OpenAPI (/docs-json).\n\n1. Suba a API e rode a pasta "00 - Autenticação" (guarda um token por perfil).\n2. Rode "01 - Fluxo da OS" em ordem para percorrer o ciclo completo.\n3. As demais pastas cobrem todos os endpoints, por contexto.\n\nVariável `role` (admin, advisor, mechanic, stock) escolhe qual token vai no Authorization; padrão admin.\nWebhook: X-Signature = sha256=<HMAC-SHA256 do corpo bruto com BUDGET_WEBHOOK_SECRET>; o script calcula sozinho usando `webhookSecret`.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{authToken}}', type: 'string' }] },
  event: [
    pre([
      'const role = (pm.collectionVariables.get("role") || "admin").toLowerCase();',
      'const t = pm.collectionVariables.get("token_" + role) || pm.collectionVariables.get("token");',
      'pm.variables.set("authToken", t);',
    ]),
  ],
  variable: [
    ['baseUrl', 'http://localhost:3000'],
    ['password', 'Password123!'],
    ['adminEmail', 'admin@example.com'],
    ['advisorEmail', 'advisor@example.com'],
    ['mechanicEmail', 'mechanic@example.com'],
    ['stockEmail', 'stock@example.com'],
    ['role', 'admin'],
    ['webhookSecret', 'troque-por-um-segredo-do-webhook'],
    ['token', ''],
    ['token_admin', ''],
    ['token_advisor', ''],
    ['token_mechanic', ''],
    ['token_stock', ''],
    ['serviceOrderId', ''],
    ['serviceId', ''],
    ['partId', ''],
    ['clientId', ''],
    ['vehicleId', ''],
    ['userId', ''],
    ['userEmail', ''],
    ['id', ''],
    ['trackingToken', ''],
    ['decisionToken', ''],
  ].map(([key, value]) => ({ key, value })),
  item: [
    { name: '00 - Autenticação', item: logins },
    { name: '01 - Fluxo da OS', item: lc },
    { name: '01b - Caminhos alternativos', item: alt },
    ...order
      .filter((t) => groups[t])
      .map((t) => ({ name: '02 - ' + folderName[t], item: groups[t] })),
  ],
};
// fix the public tracking token var for generic track
fs.writeFileSync(outFile, JSON.stringify(col, null, 2) + '\n');
const total = Object.values(groups).flat().length;
console.log('requests genéricos', total, '| fluxo', lc.length, '| alternativos', alt.length);
