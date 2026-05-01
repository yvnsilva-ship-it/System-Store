SYSTEM STORE - VERSÃO PIX SEMI AUTOMÁTICO

Arquivos necessários no GitHub/Railway:
- index.js
- package.json

Variável obrigatória no Railway:
TOKEN=token_do_seu_bot

Variáveis recomendadas:
PREFIX=!
NOMEBOT=System Store
COR_PADRAO=#0073ff
PIX_KEY=sua_chave_pix
CANAL_LOGS=id_do_canal_de_logs
CATEGORIA_CARRINHO=id_da_categoria_dos_carrinhos
CARGO_VIP=id_do_cargo_cliente
ADMIN_ROLE_ID=id_do_cargo_admin

Fluxo de pagamento:
1. Cliente clica em Comprar.
2. Bot abre carrinho.
3. Cliente escolhe quantidade/cupom e clica em Pagar.
4. Bot mostra chave Pix e ID do pedido.
5. Cliente envia comprovante no carrinho e clica em Ja paguei.
6. Administrador clica em Confirmar pagamento.
7. Bot entrega o produto automaticamente na DM do cliente.

Comandos importantes:
!configbot - configurar nome, cargo cliente, chave Pix e cor
!configcanal - configurar logs, categoria carrinho, imagem e cargo admin
!add - criar produto
!stock - ver estoque
!set <id> - criar painel de compra
!gerenciar <id> - editar produto
!status <id_pedido> - ver status do pedido manual
