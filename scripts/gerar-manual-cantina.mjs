/**
 * Gera manual da Cantina (PDF) com screenshots reais do sistema local.
 * Uso: node scripts/gerar-manual-cantina.mjs
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'docs', 'manuais', 'cantina')
const SHOTS = path.join(OUT_DIR, 'screenshots')

const BASE = process.env.MANUAL_BASE_URL || 'http://localhost:5173'
const USER = process.env.MANUAL_USER || 'admin'
const PASS = process.env.MANUAL_PASS || 'admin123'
const RECIBO_CODIGO = process.env.MANUAL_RECIBO || '6571a4fa-658d-414d-b7a0-ad9c97c4cb28'
const COBRANCA_PAGA_ID = process.env.MANUAL_COBRANCA || '40'

fs.mkdirSync(SHOTS, { recursive: true })

async function login(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
  await page.fill('#username', USER)
  await page.fill('#password', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 })
}

async function shot(page, name, opts = {}) {
  const file = path.join(SHOTS, `${name}.png`)
  await page.screenshot({
    path: file,
    fullPage: opts.fullPage ?? true,
  })
  return file
}

async function captureScreenshots(page) {
  const files = {}

  await login(page)
  files.login = await shot(page, '01-login')

  await page.goto(`${BASE}/admin/loja`, { waitUntil: 'networkidle' })
  files.hub = await shot(page, '02-hub-loja')

  await page.goto(`${BASE}/admin/loja/cantina/produtos`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  files.produtos = await shot(page, '03-produtos-cantina')

  await page.goto(`${BASE}/admin/loja/cantina/nova-venda`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const addButtons = page.locator('button').filter({ hasText: /Adicionar|^\+\s*$/ })
  const count = await addButtons.count()
  for (let i = 0; i < Math.min(2, count); i++) {
    await addButtons.nth(i).click()
    await page.waitForTimeout(350)
  }
  const comprador = page.locator('input').filter({ has: page.locator('xpath=../label[contains(.,"Comprador")]') }).first()
  if (await comprador.count()) {
    await comprador.fill('João da Cantina')
  } else {
    await page.locator('label:has-text("Comprador") + input, label:has-text("Comprador") ~ input').first().fill('João da Cantina').catch(() => {})
  }
  files.pdv = await shot(page, '04-pdv-venda')

  await page.goto(`${BASE}/admin/loja/cantina/reservas`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  files.reservas = await shot(page, '05-reservas')

  await page.goto(`${BASE}/admin/loja/vendas?`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const catSelect = page.locator('select').filter({ has: page.locator('option[value="cantina"]') }).first()
  if (await catSelect.count()) {
    await catSelect.selectOption('cantina')
    await page.waitForTimeout(800)
  }
  files.vendas = await shot(page, '06-historico-vendas')

  const reciboBtn = page.locator('button').filter({ hasText: 'Recibo' }).first()
  if (await reciboBtn.count()) {
    await reciboBtn.click()
    await page.waitForTimeout(1200)
    files.reciboModal = await shot(page, '07-recibo-modal')
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(400)
  }

  await page.goto(`${BASE}/admin/loja/pagamento/${COBRANCA_PAGA_ID}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  files.pagamentoOk = await shot(page, '08-pagamento-confirmado')

  await page.goto(`${BASE}/recibo/${RECIBO_CODIGO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  files.reciboPublico = await shot(page, '09-recibo-cliente')

  await page.goto(`${BASE}/admin/configuracoes`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const tabWa = page.getByRole('button', { name: /WhatsApp/i }).or(page.locator('button').filter({ hasText: /^WhatsApp$/ }))
  if (await tabWa.count()) {
    await tabWa.first().click()
    await page.waitForTimeout(600)
    const subMsg = page.locator('button').filter({ hasText: /^Mensagens$/ })
    if (await subMsg.count()) await subMsg.first().click()
    await page.waitForTimeout(600)
  }
  files.configWa = await shot(page, '10-config-whatsapp')

  return files
}

function imgTag(file, alt) {
  const rel = path.relative(OUT_DIR, file).replace(/\\/g, '/')
  return `<figure><img src="${rel}" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`
}

function buildHtml(files) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Manual da Cantina — Champions Church</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; line-height: 1.55; font-size: 11.5pt; }
  h1 { color: #0f172a; font-size: 24pt; margin: 0 0 8px; }
  h2 { color: #b45309; font-size: 16pt; margin: 28px 0 10px; page-break-after: avoid; }
  h3 { color: #334155; font-size: 13pt; margin: 18px 0 8px; }
  p, li { margin: 0 0 8px; }
  ul, ol { margin: 0 0 12px 18px; padding: 0; }
  .capa { text-align: center; padding: 40px 0 24px; page-break-after: always; }
  .capa p { color: #64748b; }
  .destaque { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px 14px; margin: 12px 0; }
  .dica { background: #f0f9ff; border-left: 4px solid #0284c7; padding: 10px 14px; margin: 12px 0; }
  figure { margin: 14px 0 18px; page-break-inside: avoid; }
  img { width: 100%; max-width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; }
  figcaption { font-size: 9.5pt; color: #64748b; margin-top: 6px; text-align: center; }
  .toc { page-break-after: always; }
  .toc ol { font-size: 12pt; }
  section { page-break-inside: avoid; }
</style>
</head>
<body>

<div class="capa">
  <h1>Manual da Cantina</h1>
  <p><strong>Champions Church</strong> — passo a passo para quem atende no balcão</p>
  <p>Versão do sistema: maio/2026 · Linguagem simples · Com telas reais</p>
</div>

<div class="toc">
  <h2>Sumário</h2>
  <ol>
    <li>Antes de começar</li>
    <li>Entrar no sistema</li>
    <li>Escolher a Cantina</li>
    <li>Cadastrar produtos</li>
    <li>Vender no balcão</li>
    <li>Receber pagamento (dinheiro, PIX e cartão)</li>
    <li>Reservas</li>
    <li>Histórico, recibo e WhatsApp</li>
    <li>Configurações importantes</li>
    <li>Dúvidas rápidas no balcão</li>
  </ol>
</div>

<section>
  <h2>1. Antes de começar</h2>
  <p>Este manual é para quem trabalha na <strong>cantina</strong> da igreja — receber pedido, lançar venda, cobrar e entregar.</p>
  <p>O sistema separa <strong>Cantina</strong> (comida e bebida) de <strong>Loja</strong> (camisetas, livros etc.). Aqui falamos só da cantina.</p>
  <div class="destaque"><strong>Importante:</strong> use sempre o login que a liderança passou. Não compartilhe usuário e senha com visitantes.</div>
</section>

<section>
  <h2>2. Entrar no sistema</h2>
  <ol>
    <li>Abra o site da igreja e vá em <strong>Admin</strong> (ou acesse direto <code>/admin/login</code>).</li>
    <li>Digite <strong>usuário</strong> e <strong>senha</strong>.</li>
    <li>Clique em <strong>Entrar</strong>.</li>
  </ol>
  ${files.login ? imgTag(files.login, 'Tela de login do painel administrativo') : ''}
</section>

<section>
  <h2>3. Escolher a Cantina</h2>
  <p>No menu lateral, clique em <strong>Loja / Cantina</strong>. Na tela inicial, escolha o card <strong>Cantina</strong>.</p>
  <p>Ali embaixo também tem atalho para <strong>Reservas</strong>, <strong>Histórico de vendas</strong> e <strong>Financeiro</strong>.</p>
  ${files.hub ? imgTag(files.hub, 'Tela inicial — escolher Cantina ou Loja') : ''}
  <div class="dica"><strong>Dica de balcão:</strong> se você só vende salgado e refrigerante, fique na Cantina. Não precisa abrir a Loja.</div>
</section>

<section>
  <h2>4. Cadastrar produtos</h2>
  <p>Vá em <strong>Produtos</strong> (menu de cima, dentro da Cantina).</p>
  <ul>
    <li><strong>Novo produto:</strong> nome, preço, foto (se tiver), estoque.</li>
    <li><strong>Comida ou bebida:</strong> marque o segmento certo — ajuda a filtrar na hora de vender.</li>
    <li><strong>Ativo:</strong> produto desligado some do balcão.</li>
  </ul>
  ${files.produtos ? imgTag(files.produtos, 'Lista de produtos da cantina') : ''}
</section>

<section>
  <h2>5. Vender no balcão</h2>
  <p>Clique em <strong>Vender</strong>. Essa é a tela do dia a dia:</p>
  <ol>
    <li>Toque no <strong>+</strong> do produto que a pessoa pediu.</li>
    <li>Confira o carrinho à direita (ou embaixo no celular).</li>
    <li>Coloque o <strong>nome de quem comprou</strong> — facilita achar depois no histórico.</li>
    <li>Escolha como vai receber: <strong>Dinheiro</strong>, <strong>PIX/Mercado Pago</strong> ou <strong>Cartão/Mercado Pago</strong>.</li>
  </ol>
  ${files.pdv ? imgTag(files.pdv, 'Tela de venda (PDV) da cantina com itens no carrinho') : ''}
  <h3>Dinheiro</h3>
  <p>Se a pessoa pagou certinho, pode deixar o campo “valor recebido” vazio. Se deu nota maior, digite quanto recebeu — o sistema calcula o troco.</p>
  <h3>PIX ou cartão</h3>
  <p>O sistema abre a tela de pagamento na hora. Mostra os produtos e o total antes de cobrar.</p>
</section>

<section>
  <h2>6. Receber pagamento</h2>
  <h3>PIX</h3>
  <ul>
    <li>Aparece o QR Code na tela.</li>
    <li>A pessoa paga pelo app do banco.</li>
    <li>Quando cair, a tela confirma sozinha (ou clique em verificar).</li>
  </ul>
  <h3>Cartão</h3>
  <ul>
    <li>Preencha os dados no formulário do Mercado Pago na tela.</li>
    <li>O e-mail é obrigatório — peça para a pessoa informar ou use um e-mail de contato.</li>
  </ul>
  <h3>Depois de pago</h3>
  <p>Aparece a confirmação com resumo da venda. Dá para <strong>imprimir/salvar PDF</strong> e <strong>mandar recibo no WhatsApp</strong> se a pessoa quiser.</p>
  ${files.pagamentoOk ? imgTag(files.pagamentoOk, 'Tela de pagamento confirmado com opção de recibo') : ''}
</section>

<section>
  <h2>7. Reservas</h2>
  <p>Quando alguém pede para <strong>separar</strong> e pagar depois (ex.: encomenda para o culto), use <strong>Reservas</strong>.</p>
  <ol>
    <li>Escolha a <strong>data</strong>.</li>
    <li>Coloque o <strong>nome</strong> de quem reservou.</li>
    <li>Adicione os produtos e salve.</li>
    <li>Na hora de cobrar, use <strong>Cobrar</strong> — vai para a tela de venda/pagamento.</li>
  </ol>
  <p>Ao lado do nome tem o botão do <strong>WhatsApp</strong> para mandar lembrete: “tem reserva pendente, precisa pagar e retirar”.</p>
  ${files.reservas ? imgTag(files.reservas, 'Tela de reservas da cantina') : ''}
</section>

<section>
  <h2>8. Histórico, recibo e WhatsApp</h2>
  <h3>Ver vendas antigas</h3>
  <p>Em <strong>Histórico</strong>, filtre por <strong>Cantina</strong> para ver só o balcão. Vendas pagas têm botão <strong>Recibo</strong>.</p>
  ${files.vendas ? imgTag(files.vendas, 'Histórico de vendas filtrado pela cantina') : ''}
  ${files.reciboModal ? imgTag(files.reciboModal, 'Modal para ver e enviar recibo pelo WhatsApp') : ''}
  <h3>Recibo para o cliente</h3>
  <p>O link do recibo abre uma página simples no celular da pessoa — dá para salvar ou imprimir.</p>
  ${files.reciboPublico ? imgTag(files.reciboPublico, 'Recibo público que o cliente recebe') : ''}
  <div class="destaque"><strong>No balcão:</strong> pergunte “Quer o comprovante no WhatsApp?”. Se sim, digite o número com DDD e envie.</div>
</section>

<section>
  <h2>9. Configurações importantes</h2>
  <p>Só quem é admin configura. Na aba <strong>WhatsApp → Mensagens</strong> estão os textos de:</p>
  <ul>
    <li><strong>Recibo da loja/cantina</strong> — mensagem com link do comprovante.</li>
    <li><strong>Reserva da cantina</strong> — lembrete de reserva pendente.</li>
  </ul>
  <p>Em <strong>Credenciais</strong>, a cantina usa instância e token <strong>separados</strong> dos eventos — um WhatsApp para loja, outro para inscrições.</p>
  ${files.configWa ? imgTag(files.configWa, 'Configurações de WhatsApp da loja/cantina') : ''}
</section>

<section>
  <h2>10. Dúvidas rápidas no balcão</h2>
  <h3>“O PIX não confirmou”</h3>
  <ul>
    <li>Peça para a pessoa conferir se pagou o valor certo.</li>
    <li>Na tela de pagamento, clique em <strong>Verificar pagamento</strong>.</li>
    <li>No histórico, use <strong>Atualizar pendentes</strong> se aparecer.</li>
  </ul>
  <h3>“Quero cancelar / corrigi errado”</h3>
  <p>Chame quem tem perfil de admin. Exclusão de venda paga é restrita.</p>
  <h3>“Cadê a reserva de fulano?”</h3>
  <p>Reservas → mesma data → procure pelo nome. Se tiver WhatsApp cadastrado, dá para mandar lembrete pelo botão ao lado.</p>
  <h3>“Isso é nota fiscal?”</h3>
  <p>Não. É <strong>recibo interno</strong> da igreja para controle e comprovante simples pro cliente.</p>
</section>

<p style="margin-top:32px;color:#94a3b8;font-size:9pt;text-align:center;">Manual gerado automaticamente com telas reais do sistema · Champions Church</p>
</body>
</html>`
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: 'pt-BR',
  })
  const page = await context.newPage()

  console.log('Capturando telas...')
  const files = await captureScreenshots(page)

  const html = buildHtml(files)
  const htmlPath = path.join(OUT_DIR, 'manual-cantina.html')
  fs.writeFileSync(htmlPath, html, 'utf8')
  console.log('HTML:', htmlPath)

  const pdfPath = path.join(OUT_DIR, 'Manual-Cantina-Champions-Church.pdf')
  const pdfPage = await context.newPage()
  await pdfPage.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' })
  await pdfPage.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
  })
  console.log('PDF:', pdfPath)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
