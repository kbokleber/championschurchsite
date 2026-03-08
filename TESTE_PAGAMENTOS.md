# Teste do fluxo de pagamentos (Mercado Pago)

Use este checklist para validar PIX e cartão de crédito no site (boleto não é oferecido).

## Pré-requisitos

- Mercado Pago ativo em **Configurações** (credenciais de produção ou teste).
- Webhook configurado no painel MP: `https://champions.kbosolucoes.com.br/api/mercadopago/webhook/`
- Webhook Secret preenchido no admin (Configurações → Mercado Pago).

---

## Checklist rápido

### 1. Tela de pagamento (antes de abrir o MP)

- [ ] Acessar um evento com inscrição paga → ir para "Pagamento".
- [ ] Ver o texto: **"Pague com PIX ou cartão de crédito"** no topo.
- [ ] Dois botões: **"PIX (abre Mercado Pago)"** e **"Cartão aqui (paga no site, sem conta no MP)"**.

### 2. Cartão **no site** (sem conta no Mercado Pago)

- [ ] Na tela de pagamento, clicar em **"Cartão aqui (paga no site, sem conta no MP)"**.
- [ ] Formulário de cartão (Card Payment Brick) carrega na própria página.
- [ ] Preencher dados do cartão e pagar; **não é necessário ter conta no Mercado Pago**.
- [ ] Após aprovação, a página atualiza e libera ingressos.

### 3. PIX (Mercado Pago)

- [ ] Clicar em **"PIX (abre Mercado Pago)"**; página do Checkout Pro abre (nova aba).
- [ ] Pagar com **PIX** na tela do MP (boleto não é oferecido).

### 4. Teste com PIX (produção ou sandbox)

- [ ] Escolher PIX, copiar código ou QR, simular pagamento (sandbox) ou pagar de verdade.
- [ ] Voltar ao site: em até ~5 s a página deve mostrar "Pagamento Confirmado!" e liberar ingressos.
- [ ] Em **Meus ingressos**, ingresso com QR Code disponível.

### 5. Teste com cartão (produção ou sandbox)

- [ ] Usar **"Cartão aqui"** na página de pagamento (formulário no site) ou cartão no Checkout Pro após abrir o link PIX.
- [ ] Cartão de teste (sandbox) ou cartão real (produção).
- [ ] Concluir pagamento.
- [ ] Voltar ao site: "Pagamento Confirmado!" e ingressos liberados.
- [ ] Admin → Cobranças: status "Pago" e método "Mercado Pago".

### 6. Webhook e idempotência

- [ ] Painel MP → Simular notificações → **200** (não 403/404).
- [ ] Após um pagamento real, cobrança e inscrições atualizam mesmo sem ficar na tela (webhook em background).

---

## Dados de teste (sandbox MP)

- Cartão de teste: ver [Documentação MP - cartões de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/test-cards).
- CPF de teste: 191.191.191-00 (ou outro da doc).
- Em **Modo de teste**, nenhum valor real é cobrado.

---

## Se algo falhar

- **403 no webhook:** conferir Webhook Secret no admin e no painel MP (igual).
- **Cartão sem conta:** use o botão **"Cartão aqui (paga no site, sem conta no MP)"** na página de pagamento; o formulário de cartão abre no próprio site.
- **Pagamento aprovado mas site não atualiza:** verificar se a URL do webhook está correta e acessível; ver logs do backend.
