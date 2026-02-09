# Teste do fluxo de pagamentos (Mercado Pago)

Use este checklist para validar PIX, cartão e boleto no site.

## Pré-requisitos

- Mercado Pago ativo em **Configurações** (credenciais de produção ou teste).
- Webhook configurado no painel MP: `https://champions.kbosolucoes.com.br/api/mercadopago/webhook/`
- Webhook Secret preenchido no admin (Configurações → Mercado Pago).

---

## Checklist rápido

### 1. Tela de pagamento (antes de abrir o MP)

- [ ] Acessar um evento com inscrição paga → ir para "Pagamento".
- [ ] Ver o texto: **"PIX, cartão de crédito/débito ou boleto"** no topo.
- [ ] Ver a lista: PIX, Cartão de crédito (até 12x), Cartão de débito, Boleto.
- [ ] Botão: **"Ir ao Mercado Pago (PIX, cartão ou boleto)"**.

### 2. No Mercado Pago (ao clicar no botão)

- [ ] Página do Checkout Pro abre (nova aba).
- [ ] Opções visíveis: **PIX**, **Cartão** (crédito/débito) e **Boleto** (conforme conta MP).

### 3. Teste com PIX (produção ou sandbox)

- [ ] Escolher PIX, copiar código ou QR, simular pagamento (sandbox) ou pagar de verdade.
- [ ] Voltar ao site: em até ~5 s a página deve mostrar "Pagamento Confirmado!" e liberar ingressos.
- [ ] Em **Meus ingressos**, ingresso com QR Code disponível.

### 4. Teste com cartão (produção ou sandbox)

- [ ] Escolher "Cartão" no Checkout Pro.
- [ ] Usar cartão de teste (sandbox) ou cartão real (produção).
- [ ] Concluir pagamento.
- [ ] Voltar ao site: "Pagamento Confirmado!" e ingressos liberados.
- [ ] Admin → Cobranças: status "Pago" e método "Mercado Pago".

### 5. Webhook e idempotência

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
- **Só PIX aparece no MP:** conferir que o deploy tem a alteração com `payment_methods` (listas vazias + installments) no backend.
- **Pagamento aprovado mas site não atualiza:** verificar se a URL do webhook está correta e acessível; ver logs do backend.
