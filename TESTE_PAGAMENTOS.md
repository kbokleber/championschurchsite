# Teste do fluxo de pagamentos (Mercado Pago — checkout transparente)

Use este checklist para validar PIX embutido e cartão na própria página (sem redirect ao Checkout Pro).

## Pré-requisitos

- Mercado Pago ativo em **Configurações** (credenciais de produção e/ou teste).
- Webhook configurado no painel MP: `https://championschurch.com.br/api/mercadopago/webhook/` (ou URL do ambiente).
- Webhook Secret preenchido no admin (Configurações → Mercado Pago).

---

## Checklist rápido

### 1. Tela de pagamento (eventos)

- [ ] Acessar evento com inscrição paga → ir para `/pagamento/:id`.
- [ ] Ver abas **PIX** e **Cartão** na mesma página (sem botão “Ir ao Mercado Pago”).
- [ ] Texto: pagamento no site, checkout transparente.

### 2. PIX embutido (eventos)

- [ ] Aba **PIX**: QR gerado automaticamente (sem formulário de e-mail/CPF).
- [ ] Usa e-mail da inscrição + **CPF/CNPJ pagador PIX (loja)** em Configurações → Mercado Pago.
- [ ] Aparece QR e botão **Copiar código PIX**.
- [ ] Pagar via app do banco; em até ~5 s a página mostra **Pagamento Confirmado** (polling + webhook).
- [ ] Status da cobrança no admin: **Pago**, método **Mercado Pago (PIX)**.

### 3. Cartão no site (Brick)

- [ ] Aba **Cartão**: preencher e-mail e CPF; formulário Brick carrega.
- [ ] Preencher cartão e concluir (sem conta MP).
- [ ] Em sandbox com “Cartão em Sandbox”: titular **APRO**, CPF **12345678909**, cartão de teste da doc MP.
- [ ] Ingressos liberados após aprovação.

### 4. Loja / cantina (admin)

- [ ] Em **Configurações → Mercado Pago**, preencher **CPF/CNPJ pagador PIX (loja)** (e opcionalmente e-mail).
- [ ] PDV → venda com **PIX / cartão** → tela `/admin/loja/pagamento/:id`.
- [ ] **Sem** formulário de e-mail/CPF do comprador — PIX gera QR automaticamente; cartão usa dados da igreja no backend.
- [ ] Em sandbox: titular **APRO**, CPF **12345678909**, cartão de teste.
- [ ] Após pagamento, venda **paga** e estoque baixado.

### 5. Webhook e idempotência

- [ ] Painel MP → Simular notificações → **200** (não 403/404).
- [ ] Pagamento confirmado mesmo se o usuário fechar a aba (webhook em background).

---

## Dados de teste (sandbox cartão)

Painel MP → sua aplicação → **Cartões de teste**. Credenciais **Sandbox (Test)** em Configurações do site devem ser do **mesmo app** (Public Key + Access Token juntos).

| Bandeira | Número | CVV | Validade |
|----------|--------|-----|----------|
| Mastercard | 5031 4332 1540 6351 | 123 | 11/30 |
| Visa | 4235 6477 2802 5682 | 123 | 11/30 |
| American Express | 3753 651535 56885 | 1234 | 11/30 |
| Elo débito | 5067 7667 8388 8311 | 123 | 11/30 |

**Nome do titular** (define o resultado): **APRO** = aprovado · **OTHE** = recusado · **CONT** = pendente · **FUND** = sem saldo.

**CPF** (documento): **12345678909** (somente números no envio).

Com **Cartão em Sandbox** ativo e ambiente geral em Produção: PIX usa produção; cartão usa credenciais de teste.

**Erro 401 (credenciais incompatíveis):** quase sempre o **Access Token de Sandbox** foi copiado de **Contas de teste** (conta `TESTUSER…`) em vez de **Credenciais de teste** da aplicação. Public Key e Access Token devem vir da **mesma tela** no painel MP. Use **Testar conexão** no admin — agora também valida a API de cartão.

---

## Se algo falhar

- **403 no webhook:** conferir Webhook Secret no admin e no painel MP (iguais).
- **Brick não carrega:** `mp_public_key` sandbox; CSP com `unsafe-eval` e iframes MP; no painel MP cadastrar `https://dev.championschurch.com.br` nas URLs da aplicação; rebuild **frontend** e **backend**.
- **PIX sem QR:** e-mail + CPF obrigatórios; valor mínimo R$ 0,01.
- **Pagamento aprovado mas site não atualiza:** URL do webhook acessível; logs do backend.

---

## Endpoints (referência)

| Ação | Método | URL |
|------|--------|-----|
| Config (Brick) | GET | `/api/mercadopago/config/?for=card` |
| PIX embutido (eventos) | POST | `/api/mercadopago/criar-pix-embutido/` |
| Cartão (eventos) | POST | `/api/mercadopago/pagar-cartao/` |
| PIX embutido (loja) | POST | `/api/loja/mercadopago/criar-pix-embutido/` |
| Cartão (loja) | POST | `/api/loja/mercadopago/pagar-cartao/` |
| Verificar | GET | `/api/mercadopago/verificar/:id/` ou `/api/loja/mercadopago/verificar/:id/` |

O endpoint legado `criar-pix` (Checkout Pro / preferência) permanece na API, mas a interface usa apenas checkout transparente.

## Identificação no painel Mercado Pago

Cada pagamento (PIX/cartão) envia ao MP:

- **description:** ex. `Evento: Culto Domingo — Inscrição — ref. ABC` ou `Lojinha / Cantina — Venda #12`
- **additional_info.items[].title:** `Evento: …` ou `Lojinha / Cantina`
- **metadata.origem:** `evento` ou `loja`

Pagamentos **novos** passam a aparecer assim no extrato. Transações antigas mantêm o texto genérico.
