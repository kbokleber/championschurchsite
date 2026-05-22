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

### 2. PIX embutido

- [ ] Aba **PIX**: preencher e-mail e CPF do pagador.
- [ ] Clicar **Gerar QR Code PIX** → aparece QR e botão **Copiar código PIX**.
- [ ] Pagar via app do banco; em até ~5 s a página mostra **Pagamento Confirmado** (polling + webhook).
- [ ] Status da cobrança no admin: **Pago**, método **Mercado Pago (PIX)**.

### 3. Cartão no site (Brick)

- [ ] Aba **Cartão**: preencher e-mail e CPF; formulário Brick carrega.
- [ ] Preencher cartão e concluir (sem conta MP).
- [ ] Em sandbox com “Cartão em Sandbox”: titular **APRO**, CPF **12345678909**, cartão de teste da doc MP.
- [ ] Ingressos liberados após aprovação.

### 4. Loja / cantina (admin)

- [ ] Em **Configurações → Mercado Pago**, preencher **CPF ou CNPJ (loja)** (e opcionalmente e-mail PIX loja).
- [ ] PDV → venda com **PIX / cartão** → tela `/admin/loja/pagamento/:id`.
- [ ] **Sem** formulário de e-mail/CPF do cliente — QR/cartão em nome da igreja.
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

**Erro 401:** Brick (chave pública) e backend (access token) em ambientes ou apps diferentes — corrija o par Sandbox no admin.

---

## Se algo falhar

- **403 no webhook:** conferir Webhook Secret no admin e no painel MP (iguais).
- **Brick não carrega:** verificar `mp_public_key` (sandbox se cartão em sandbox) e CSP (`sdk.mercadopago.com`).
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
