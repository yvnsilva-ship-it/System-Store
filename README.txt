SYSTEM STORE CORRIGIDO

Arquivos necessários na mesma pasta:
- index.js
- package.json
- database.json é criado automaticamente ao iniciar

Railway:
1. Suba index.js e package.json para o GitHub.
2. Em Variables, coloque pelo menos:
   TOKEN=token_do_bot

Variáveis opcionais:
PREFIX=!
NOMEBOT=System Store
COR_PADRAO=#0073ff
IMAGEM_PADRAO=https://i.imgur.com/8Km9tLL.png
CANAL_LOGS=id_do_canal_de_logs
CATEGORIA_CARRINHO=id_da_categoria
MP_ACCESS_TOKEN=token_do_mercado_pago
CARGO_VIP=id_do_cargo_cliente
ADMIN_ROLE_ID=id_do_cargo_admin
CANAL_VOZ=id_do_canal_de_voz
CANAL_VENDAS=id_do_canal_para_logs_de_venda_manual
VERIFICACAO_CANAL=id_do_canal_de_verificacao
VERIFICACAO_CARGO=id_do_cargo_verificado
PERM_ROLE_ID=id_do_cargo_para_botao_perm
PIX_KEY=sua_chave_pix

Comando de start no Railway:
npm start

Se npm ci falhar, use Build Command:
npm install
