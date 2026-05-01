require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const ms = require('ms');
const moment = require('moment');
const Discord = require('discord.js');
const { Client, Intents, MessageEmbed, MessageActionRow, MessageButton, MessageAttachment, Permissions } = Discord;

moment.locale('pt-br');

const app = express();
app.get('/', (_req, res) => res.send('Bot online.'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Web server online.'));

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.GUILD_VOICE_STATES
  ],
  partials: ['CHANNEL', 'MESSAGE', 'REACTION']
});

const DB_FILE = path.join(__dirname, 'database.json');
const PREFIX = process.env.PREFIX || '<';

function baseDb() {
  return {
    config: {
      nomebot: process.env.NOMEBOT || 'System Store',
      cor: process.env.COR_PADRAO || '#0073ff',
      imagem: process.env.IMAGEM_PADRAO || 'https://i.imgur.com/8Km9tLL.png',
      logs: process.env.CANAL_LOGS || '',
      categoria: process.env.CATEGORIA_CARRINHO || '',
      cargo: process.env.CARGO_VIP || '',
      adminRoleId: process.env.ADMIN_ROLE_ID || '',
      canalVoz: process.env.CANAL_VOZ || '',
      vendaChannel: process.env.CANAL_VENDAS || '',
      verificationChannel: process.env.VERIFICACAO_CANAL || '',
      verificationRole: process.env.VERIFICACAO_CARGO || '',
      permRoleId: process.env.PERM_ROLE_ID || '',
      pixKey: process.env.PIX_KEY || ''
    },
    products: {},
    coupons: {},
    stats: { pedidostotal: 0, gastostotal: 0, days: {} },
    money: {},
    ratings: [],
    pendingOrders: {}
  };
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(baseDb(), null, 2));
  }
  try {
    const current = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return mergeDefaults(current, baseDb());
  } catch (err) {
    console.error('Erro lendo database.json:', err);
    fs.writeFileSync(DB_FILE, JSON.stringify(baseDb(), null, 2));
    return baseDb();
  }
}

function mergeDefaults(target, defaults) {
  for (const key of Object.keys(defaults)) {
    if (target[key] === undefined || target[key] === null) target[key] = defaults[key];
    else if (typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
      target[key] = mergeDefaults(target[key], defaults[key]);
    }
  }
  return target;
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let database = loadDb();

function getCfg(key) {
  const envMap = {
    nomebot: 'NOMEBOT', cor: 'COR_PADRAO', imagem: 'IMAGEM_PADRAO', logs: 'CANAL_LOGS',
    categoria: 'CATEGORIA_CARRINHO', cargo: 'CARGO_VIP', adminRoleId: 'ADMIN_ROLE_ID', canalVoz: 'CANAL_VOZ',
    vendaChannel: 'CANAL_VENDAS', verificationChannel: 'VERIFICACAO_CANAL',
    verificationRole: 'VERIFICACAO_CARGO', permRoleId: 'PERM_ROLE_ID', pixKey: 'PIX_KEY'
  };
  return process.env[envMap[key]] || database.config[key] || '';
}

function setCfg(key, value) {
  database.config[key] = String(value || '').trim();
  saveDb(database);
}

function color() {
  const c = getCfg('cor') || '#0073ff';
  return c.startsWith('#') ? c : `#${c}`;
}

function isAdmin(messageOrInteraction) {
  const member = messageOrInteraction.member;
  if (!member) return false;
  const roleId = getCfg('adminRoleId');
  return member.permissions.has(Permissions.FLAGS.ADMINISTRATOR) || (roleId && member.roles.cache.has(roleId));
}

function noPerm() {
  return new MessageEmbed()
    .setTitle('Erro - Permissão')
    .setDescription('Você não tem permissão para usar isto.')
    .setColor(color());
}

function embedBase(title, description) {
  const e = new MessageEmbed().setTitle(title).setDescription(description).setColor(color());
  const img = getCfg('imagem');
  if (img && img.startsWith('http')) e.setImage(img);
  return e;
}

async function ask(message, question, time = 60000) {
  const sent = await message.channel.send({ embeds: [embedBase(getCfg('nomebot'), question)] });
  const collected = await message.channel.awaitMessages({
    filter: m => m.author.id === message.author.id,
    max: 1,
    time
  });
  if (!collected.size) {
    await sent.edit({ embeds: [embedBase(getCfg('nomebot'), 'Tempo esgotado. Tente novamente.')] }).catch(() => {});
    return null;
  }
  const msg = collected.first();
  await sent.delete().catch(() => {});
  await msg.delete().catch(() => {});
  return msg.content.trim();
}

function parsePrice(text) {
  const n = Number(String(text).replace('R$', '').replace(',', '.').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function todayKey() {
  return moment().format('YYYY-MM-DD');
}

function addStats(amount) {
  const key = todayKey();
  if (!database.stats.days[key]) database.stats.days[key] = { pedidos: 0, recebimentos: 0 };
  database.stats.days[key].pedidos += 1;
  database.stats.days[key].recebimentos += Number(amount || 0);
  database.stats.pedidostotal += 1;
  database.stats.gastostotal += Number(amount || 0);
  saveDb(database);
}

function sumDays(days, field) {
  let total = 0;
  for (let i = 0; i < days; i++) {
    const key = moment().subtract(i, 'days').format('YYYY-MM-DD');
    total += Number(database.stats.days[key]?.[field] || 0);
  }
  return total;
}

function commandHelp() {
  return new MessageEmbed()
    .setTitle(`${getCfg('nomebot')} | Comandos`)
    .setColor(color())
    .setDescription([
      `Prefixo atual: \`${PREFIX}\``,
      '',
      '`help` - Mostra esta lista.',
      '`add` - Cria produto para venda.',
      '`stock` - Mostra todos os produtos e quantidades.',
      '`stockid <id>` - Mostra estoque de um produto.',
      '`set <id>` - Cria painel de compra do produto.',
      '`gerenciar <id>` - Edita produto.',
      '`del <id>` - Deleta produto.',
      '`backup <id>` - Envia estoque do produto no PV.',
      '`criarcupom <codigo>` - Cria cupom.',
      '`configcupom <codigo>` - Edita cupom.',
      '`configbot` - Configura nome, cargo, chave Pix e cor.',
      '`configcanal` - Configura logs, categoria, imagem e cargo ADM.',
      '`arquivo` - Salva/mostra um link de arquivo.',
      '`estatisticas` - Mostra vendas e recebimentos.',
      '`perfil [@user]` - Mostra perfil de compras.',
      '`rank` - Mostra ranking de compradores.',
      '`infobot` - Informações do bot.',
      '`manager` - Status da aplicação.',
      '`anunciar` - Cria anúncio por perguntas.',
      '`venda` - Registra venda manual por perguntas.',
      '`final` - Aviso de tempo/inatividade por perguntas.',
      '`sorteio <tempo> #canal <prêmio>` - Cria sorteio.',
      '`ticket` - Envia painel de ticket.',
      '`avaliar` - Envia painel de avaliação.',
      '`verificar` - Envia painel de verificação.',
      '`setavatar <link>` - Muda avatar do bot.',
      '`setnome <nome>` - Muda nome do bot.',
      '`setmoney <id> <valor>` - Define saldo manual.',
      '`status <id_pedido>` - Consulta pedido manual.',
      '`taxa` - Mostra aviso sobre pagamento manual.',
      '`adm` - Envia botão de permissão.',
      '`limpar [quantidade]` - Limpa mensagens.',
      '`vision` - Divulgação simples.'
    ].join('\n'));
}

const commands = new Map();
function register(names, fn) {
  for (const name of names) commands.set(name.toLowerCase(), fn);
}

register(['help', 'ajuda'], async (message) => message.channel.send({ embeds: [commandHelp()] }));

register(['vision'], async (message) => {
  await message.delete().catch(() => {});
  return message.channel.send('**Consiga nosso Bot Store pelo nosso servidor do Discord.**');
});

register(['add', 'adicionar'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const id = await ask(message, 'Envie o `ID` do produto. Exemplo: netflix');
  if (!id) return;
  if (database.products[id]) return message.channel.send('❌ Já existe um produto com esse ID.');
  const nome = await ask(message, 'Envie o `NOME` do produto.');
  if (!nome) return;
  const precoTxt = await ask(message, 'Envie o `PREÇO` do produto. Exemplo: 10 ou 10,50');
  const preco = parsePrice(precoTxt);
  if (preco === null) return message.channel.send('❌ Preço inválido.');
  const desc = await ask(message, 'Envie a `DESCRIÇÃO` do produto.');
  if (!desc) return;
  database.products[id] = { nome, preco, desc, conta: [] };
  saveDb(database);
  return message.channel.send({ embeds: [embedBase('Produto criado', `ID: \`${id}\`\nNome: **${nome}**\nPreço: **R$${preco.toFixed(2)}**`)] });
});

register(['stock', 'estoque'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const items = Object.entries(database.products);
  if (!items.length) return message.channel.send('❌ Nenhum produto criado. Use `add`.');
  const text = items.map(([id, p]) => `ID: ${id} | Nome: ${p.nome} | Quantidade: ${p.conta?.length || 0}`).join('\n');
  return message.channel.send({ embeds: [embedBase('Estoque', `\`\`\`${text}\`\`\``)] });
});

register(['stockid', 'estoqueid'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const id = args[0];
  const p = database.products[id];
  if (!id || !p) return message.channel.send('❌ Produto inexistente.');
  const itens = p.conta?.length ? p.conta.join('\n') : 'Sem estoque';
  return message.channel.send({ embeds: [embedBase(`Estoque de ${id}`, `\`\`\`${itens}\`\`\``)] });
});

register(['set'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const id = args[0];
  const p = database.products[id];
  if (!id || !p) return message.channel.send('❌ Produto inexistente.');
  const row = new MessageActionRow().addComponents(
    new MessageButton().setCustomId(`buy:${id}`).setLabel('Comprar').setStyle('SUCCESS').setEmoji('🛒')
  );
  return message.channel.send({ embeds: [productEmbed(id, p)], components: [row] });
});

function productEmbed(id, p) {
  return embedBase(`${getCfg('nomebot')} | Produto`, [
    `\`\`\`${p.desc || 'Sem descrição'}\`\`\``,
    `✨ | **ID:** \`${id}\``,
    `📦 | **Nome:** **${p.nome}**`,
    `💵 | **Preço:** **R$${Number(p.preco || 0).toFixed(2)}**`,
    `🛒 | **Estoque:** **${p.conta?.length || 0}**`
  ].join('\n'));
}

register(['gerenciar'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const id = args[0];
  const p = database.products[id];
  if (!id || !p) return message.channel.send('❌ Produto inexistente.');
  const row = new MessageActionRow().addComponents(
    new MessageButton().setCustomId(`manage:nome:${id}`).setLabel('Nome').setStyle('PRIMARY'),
    new MessageButton().setCustomId(`manage:preco:${id}`).setLabel('Valor').setStyle('PRIMARY'),
    new MessageButton().setCustomId(`manage:desc:${id}`).setLabel('Descrição').setStyle('PRIMARY'),
    new MessageButton().setCustomId(`manage:estoque:${id}`).setLabel('Estoque').setStyle('SUCCESS'),
    new MessageButton().setCustomId(`manage:delete:${id}`).setLabel('Deletar').setStyle('DANGER')
  );
  return message.channel.send({ embeds: [productEmbed(id, p)], components: [row] });
});

register(['del', 'delete'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const id = args[0];
  if (!id || !database.products[id]) return message.channel.send('❌ Produto inexistente.');
  delete database.products[id];
  saveDb(database);
  return message.channel.send('✅ Produto deletado.');
});

register(['backup'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const id = args[0];
  const p = database.products[id];
  if (!id || !p) return message.channel.send('❌ Produto inexistente.');
  await message.author.send(`Backup do produto ${id}:\n\n${(p.conta || []).join('\n') || 'Sem estoque'}`).catch(() => null);
  return message.channel.send('✅ Backup enviado no seu privado, se sua DM estiver aberta.');
});

register(['criarcupom'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const code = args[0]?.toUpperCase();
  if (!code) return message.reply('❌ Use: `criarcupom CODIGO`');
  if (database.coupons[code]) return message.reply('❌ Esse cupom já existe.');
  database.coupons[code] = { idcupom: code, quantidade: 10, minimo: 10, desconto: 10 };
  saveDb(database);
  return message.reply(`✅ Cupom \`${code}\` criado com 10 usos, mínimo R$10 e 10% de desconto.`);
});

register(['configcupom'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const code = args[0]?.toUpperCase();
  const c = database.coupons[code];
  if (!code || !c) return message.reply('❌ Cupom inexistente.');
  const row = new MessageActionRow().addComponents(
    new MessageButton().setCustomId(`coupon:qtd:${code}`).setLabel('Quantidade').setStyle('SECONDARY'),
    new MessageButton().setCustomId(`coupon:min:${code}`).setLabel('Mínimo').setStyle('SECONDARY'),
    new MessageButton().setCustomId(`coupon:pct:${code}`).setLabel('Porcentagem').setStyle('SECONDARY'),
    new MessageButton().setCustomId(`coupon:del:${code}`).setLabel('Excluir').setStyle('DANGER'),
    new MessageButton().setCustomId(`coupon:rel:${code}`).setLabel('Atualizar').setStyle('SUCCESS')
  );
  return message.channel.send({ embeds: [couponEmbed(code)], components: [row] });
});

function couponEmbed(code) {
  const c = database.coupons[code];
  return embedBase(`Configurando cupom ${code}`, `📌 | Quantidade: ${c?.quantidade || 0}\n📌 | Mínimo: R$${c?.minimo || 0}\n📌 | Desconto: ${c?.desconto || 0}%`);
}

register(['configbot'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const row = new MessageActionRow().addComponents(
    new MessageButton().setCustomId('cfgbot:nome').setLabel('Nome Bot').setStyle('SECONDARY'),
    new MessageButton().setCustomId('cfgbot:cargo').setLabel('Cargo Cliente').setStyle('SECONDARY'),
    new MessageButton().setCustomId('cfgbot:pix').setLabel('Chave Pix').setStyle('SECONDARY'),
    new MessageButton().setCustomId('cfgbot:cor').setLabel('Cor Embed').setStyle('SECONDARY')
  );
  return message.channel.send({ embeds: [configBotEmbed()], components: [row] });
});

function configBotEmbed() {
  const pix = getCfg('pixKey') || 'Não definida';
  return embedBase('Bot Store | Configurando o bot', `🚀 | **Nome:** ${getCfg('nomebot')}\n🚀 | **Cargo Cliente:** ${getCfg('cargo') ? `<@&${getCfg('cargo')}>` : 'Não definido'}\n🚀 | **Chave Pix:** ${pix}\n🚀 | **Cor:** ${color()}`);
}

register(['configcanal'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const row = new MessageActionRow().addComponents(
    new MessageButton().setCustomId('cfgcanal:logs').setLabel('Logs Vendas').setStyle('SECONDARY'),
    new MessageButton().setCustomId('cfgcanal:categoria').setLabel('Categoria Carrinho').setStyle('SECONDARY'),
    new MessageButton().setCustomId('cfgcanal:imagem').setLabel('Imagem Larga').setStyle('SECONDARY'),
    new MessageButton().setCustomId('cfgcanal:admin').setLabel('Cargo ADM').setStyle('SECONDARY')
  );
  return message.channel.send({ embeds: [configCanalEmbed()], components: [row] });
});

function configCanalEmbed() {
  return embedBase('Bot Store | Configurando canais', `🚀 | **Logs:** ${getCfg('logs') ? `<#${getCfg('logs')}>` : 'Não definido'}\n🚀 | **Categoria Carrinho:** ${getCfg('categoria') ? `<#${getCfg('categoria')}>` : 'Não definido'}\n🚀 | **Imagem:** ${getCfg('imagem') || 'Não definida'}\n🚀 | **Cargo ADM:** ${getCfg('adminRoleId') ? `<@&${getCfg('adminRoleId')}>` : 'Não definido'}`);
}

register(['arquivo'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const link = await ask(message, 'Envie o link do arquivo para salvar.');
  if (!link) return;
  database.config.arquivo = link;
  saveDb(database);
  return message.channel.send(`✅ Link salvo:\n||${link}||`);
});

register(['estatisticas'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const hojePedidos = sumDays(1, 'pedidos');
  const hojeRec = sumDays(1, 'recebimentos');
  const setePedidos = sumDays(7, 'pedidos');
  const seteRec = sumDays(7, 'recebimentos');
  const trintaPedidos = sumDays(30, 'pedidos');
  const trintaRec = sumDays(30, 'recebimentos');
  const embed = new MessageEmbed()
    .setTitle('Seus rendimentos')
    .setColor(color())
    .addField('Hoje', `Pedidos: \`${hojePedidos}\`\nRecebimentos: \`R$${hojeRec.toFixed(2)}\``, true)
    .addField('Últimos 7 dias', `Pedidos: \`${setePedidos}\`\nRecebimentos: \`R$${seteRec.toFixed(2)}\``, true)
    .addField('Últimos 30 dias', `Pedidos: \`${trintaPedidos}\`\nRecebimentos: \`R$${trintaRec.toFixed(2)}\``, true)
    .addField('Todo período', `Pedidos: \`${database.stats.pedidostotal}\` | Recebimentos: \`R$${Number(database.stats.gastostotal || 0).toFixed(2)}\``);
  return message.channel.send({ embeds: [embed] });
});

register(['perfil'], async (message) => {
  const user = message.mentions.users.first() || message.author;
  const data = database.money[user.id] || { dinheiro: 0 };
  return message.channel.send({ embeds: [embedBase(`Perfil de ${user.username}`, `💰 | Saldo manual: R$${Number(data.dinheiro || 0).toFixed(2)}`)] });
});

register(['rank'], async (message) => {
  const rows = Object.entries(database.money)
    .sort((a, b) => Number(b[1].dinheiro || 0) - Number(a[1].dinheiro || 0))
    .slice(0, 10)
    .map(([id, data], i) => `${i + 1}. <@${id}> — R$${Number(data.dinheiro || 0).toFixed(2)}`);
  return message.channel.send({ embeds: [embedBase('Ranking de clientes', rows.join('\n') || 'Sem dados ainda.')] });
});

register(['infobot', 'botinfo'], async (message) => {
  const embed = new MessageEmbed()
    .setColor(color())
    .setTimestamp()
    .setDescription(`Olá, me chamo **${client.user.username}** e fui adaptado para lojas automáticas.\n\n🛡 | Versão: 3.0.0\n🗡 | Ping: ${client.ws.ping}ms\n🌎 | Servidores: ${client.guilds.cache.size}\n📚 | Canais: ${client.channels.cache.size}`);
  return message.reply({ embeds: [embed] });
});

register(['manager'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const mem = process.memoryUsage();
  return message.channel.send({ embeds: [embedBase(`Dados sobre ${getCfg('nomebot')}`, `**Container:** Online\n**RAM:** ${(mem.rss / 1024 / 1024).toFixed(1)}MB\n**Network:** Ativa\n**Ping:** ${client.ws.ping}ms`)] });
});

register(['anunciar', 'anuncio', 'anúncio'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const channelText = await ask(message, 'Qual será o chat para enviar o anúncio? Mencione o canal ou mande o ID.');
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(channelText?.replace(/[<#>]/g, ''));
  if (!channel) return message.channel.send('❌ Canal não encontrado.');
  const title = await ask(message, 'Qual será o título do anúncio?');
  if (!title) return;
  const desc = await ask(message, 'Qual será a descrição do anúncio?');
  if (!desc) return;
  const img = await ask(message, 'Qual será a imagem do anúncio? Envie um link ou digite `pular`.');
  const embed = new MessageEmbed().setColor(color()).setTimestamp().setFooter(message.guild.name, message.guild.iconURL({ dynamic: true })).setTitle(title).setDescription(desc);
  if (img && img !== 'pular' && img.startsWith('http')) embed.setImage(img);
  await channel.send({ embeds: [embed] });
  return message.channel.send(`✅ Anúncio enviado em ${channel}.`);
});

register(['venda'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const comprador = await ask(message, 'Comprador?');
  if (!comprador) return;
  const produto = await ask(message, 'Produto comprado?');
  if (!produto) return;
  const valor = await ask(message, 'Valor vendido?');
  if (!valor) return;
  const channel = message.guild.channels.cache.get(getCfg('vendaChannel') || getCfg('logs')) || message.channel;
  await channel.send({ embeds: [embedBase('Nova venda realizada', `A staff vai analisar o pedido.\n\n**Comprador:** ${comprador}\n**Produto vendido:** ${produto}\n**Valor:** ${valor}`)] });
  return message.channel.send(`✅ Venda enviada em ${channel}.`);
});

register(['final', 'acabou', 'acabar', 'tempo'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const channelText = await ask(message, 'Qual será o chat para enviar o aviso? Mencione o canal ou mande o ID.');
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(channelText?.replace(/[<#>]/g, ''));
  if (!channel) return message.channel.send('❌ Canal não encontrado.');
  const comprador = await ask(message, 'Comprador?');
  if (!comprador) return;
  const produto = await ask(message, 'Produto ou plano?');
  if (!produto) return;
  const motivo = await ask(message, 'Motivo ou dia da compra?');
  if (!motivo) return;
  await channel.send({ embeds: [embedBase('Aviso de aplicação/plano', `**Comprador:** ${comprador}\n**Produto/Plano:** ${produto}\n**Motivo/Data:** ${motivo}`)] });
  return message.channel.send(`✅ Aviso enviado em ${channel}.`);
});

register(['sorteio', 'gw'], async (message, args) => {
  if (!isAdmin(message)) return message.reply('> **Não tem permissão para usar este comando!**');
  const tempo = args[0];
  const canal = message.mentions.channels.first();
  const premio = args.slice(2).join(' ');
  if (!tempo || !ms(tempo)) return message.reply(`Use: \`${PREFIX}sorteio 1h #canal prêmio\``);
  if (!canal) return message.reply('❌ Mencione um canal.');
  if (!premio) return message.reply('❌ Adicione um prêmio.');
  const start = new MessageEmbed().setTitle('Novo sorteio!').setDescription(`Clique em 🎉 para participar\n\n**Criado por:** ${message.author}\n**Prêmio:** **${premio}**`).setFooter('O sorteio irá acabar').setTimestamp(Date.now() + ms(tempo)).setColor(color());
  const m = await canal.send({ content: '@everyone', embeds: [start] });
  await m.react('🎉');
  setTimeout(async () => {
    const fetched = await m.fetch().catch(() => null);
    const reaction = fetched?.reactions.cache.get('🎉');
    const users = reaction ? await reaction.users.fetch().catch(() => null) : null;
    const participantes = users ? users.filter(u => !u.bot) : new Discord.Collection();
    if (!participantes.size) return canal.send(`🎉 **SORTEIO TERMINADO** 🎉\nNão houve participantes suficientes para **${premio}**.`);
    const vencedor = participantes.random();
    return canal.send({ content: `${vencedor}`, embeds: [embedBase('🎉 Sorteio finalizado', `Parabéns ${vencedor}, você ganhou **${premio}**!`)] });
  }, ms(tempo));
  return message.reply('✅ Sorteio criado.');
});

register(['ticket'], async (message) => {
  if (!isAdmin(message)) return message.reply('Você não possui permissão para utilizar este comando.');
  const embed = new MessageEmbed()
    .setColor(color())
    .setAuthor({ name: 'Ticket de Vendas e Suporte', iconURL: client.user.displayAvatarURL() })
    .setTitle('Abra um ticket')
    .setDescription('Clique no botão para abrir um ticket de compra ou suporte. Não abra ticket sem motivo.')
    .setTimestamp();
  const row = new MessageActionRow().addComponents(new MessageButton().setCustomId('ticket:open').setLabel('Abrir Ticket').setStyle('SECONDARY').setEmoji('🎫'));
  await message.channel.send({ embeds: [embed], components: [row] });
  return message.delete().catch(() => {});
});

register(['avaliar'], async (message) => {
  const row = new MessageActionRow().addComponents(
    new MessageButton().setCustomId('rate:5').setLabel('5').setEmoji('⭐').setStyle('SUCCESS'),
    new MessageButton().setCustomId('rate:3').setLabel('3').setEmoji('⭐').setStyle('DANGER')
  );
  return message.channel.send({ embeds: [embedBase(`${getCfg('nomebot')} | Avaliação`, 'Avalie os serviços do nosso servidor com **5 estrelas** ou **3 estrelas**.')], components: [row] });
});

register(['verificar'], async (message) => {
  const embed = new MessageEmbed()
    .setColor('#ff7300')
    .setTitle('Verificação Humana')
    .setDescription('Se verifique para entrar no servidor. Envie o código configurado no canal de verificação.\n\nCódigo padrão aceito pelo bot: `1F9CDF`.')
    .setFooter('Você tem: 20 minutos');
  return message.channel.send({ embeds: [embed] });
});

register(['setavatar'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const link = args.join(' ');
  if (!link || !link.startsWith('http')) return message.reply(`Use: \`${PREFIX}setavatar link_da_imagem\``);
  await client.user.setAvatar(link);
  return message.channel.send({ embeds: [embedBase('Avatar alterado', `[Clique aqui para abrir](${link})`).setImage(link)] });
});

register(['setnome', 'setname'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const name = args.join(' ');
  if (!name || name.length > 32) return message.reply('Envie um nome entre 1 e 32 caracteres.');
  await client.user.setUsername(name);
  setCfg('nomebot', name);
  return message.channel.send(`✅ Nome do bot alterado para **${name}**.`);
});

register(['setmoney'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const id = args[0]?.replace(/[<@!>]/g, '');
  const valor = parsePrice(args[1]);
  if (!id || valor === null) return message.reply(`Use: \`${PREFIX}setmoney id_ou_@membro valor\``);
  database.money[id] = database.money[id] || {};
  database.money[id].dinheiro = valor;
  saveDb(database);
  return message.reply(`✅ Saldo definido. Saldo atual: \`R$${valor.toFixed(2)}\``);
});

register(['status'], async (message, args) => {
  const id = args[0];
  if (!id) return message.reply(`Use: \`${PREFIX}status id_pedido\``);
  const order = database.pendingOrders?.[id];
  if (!order) return message.reply('❌ Pedido não encontrado. Confira o ID manual do pedido.');
  const statusMap = {
    aguardando_pagamento: 'Aguardando pagamento do cliente',
    aguardando_admin: 'Aguardando confirmação do administrador',
    aprovado: 'Aprovado e entregue',
    recusado: 'Recusado/cancelado'
  };
  return message.channel.send({ embeds: [embedBase('Status do Pedido Manual', `ID: \`${id}\`\nStatus: **${statusMap[order.status] || order.status}**\nProduto: **${order.productName || order.productId}**\nQuantidade: **${order.qtd}**\nValor: **R$${Number(order.total || 0).toFixed(2)}**`)] });
});

register(['taxa'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  return message.channel.send({ embeds: [new MessageEmbed().setTitle('Pagamento semi automático').setDescription('O Mercado Pago foi removido desta versão. O bot agora envia a chave Pix, o cliente clica em **Já paguei** e um administrador confirma ou recusa a entrega.').setColor(color())] });
});

register(['adm', 'perm'], async (message) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const row = new MessageActionRow().addComponents(new MessageButton().setCustomId('perm:toggle').setLabel('Receber permissão').setStyle('SUCCESS'));
  return message.channel.send({ embeds: [embedBase('Receba sua permissão', 'Clique no botão para receber/remover o cargo configurado em `PERM_ROLE_ID` ou `configcanal`.')], components: [row] });
});

register(['limpar', 'clear'], async (message, args) => {
  if (!isAdmin(message)) return message.channel.send({ embeds: [noPerm()] });
  const amount = Math.min(Math.max(parseInt(args[0] || '10', 10), 1), 100);
  await message.channel.bulkDelete(amount, true).catch(() => null);
  return message.channel.send(`✅ ${amount} mensagens foram solicitadas para exclusão.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const verificationChannel = getCfg('verificationChannel');
  const verificationRole = getCfg('verificationRole');
  if ((!verificationChannel || message.channel.id === verificationChannel) && ['1F9CDF', '1f9cdf'].includes(message.content.trim()) && verificationRole) {
    await message.delete().catch(() => {});
    await message.member.roles.add(verificationRole).catch(() => {});
    return;
  }

  if (message.content === 'GANHE10') {
    await message.delete().catch(() => {});
    return message.channel.send(`⚠️ | Ops! ${message.author}, a opção de cupom não pode ser utilizada ainda.`);
  }

  if (!message.content.toLowerCase().startsWith(PREFIX.toLowerCase())) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/g);
  const cmd = args.shift()?.toLowerCase();
  const fn = commands.get(cmd);
  if (!fn) return;
  try {
    await fn(message, args);
  } catch (err) {
    console.error(`Erro no comando ${cmd}:`, err);
    message.channel.send('❌ Ocorreu um erro ao executar esse comando. Veja os logs do Railway.').catch(() => {});
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  try {
    if (interaction.customId.startsWith('buy:')) return handleBuy(interaction);
    if (interaction.customId.startsWith('cart:')) return handleCart(interaction);
    if (interaction.customId.startsWith('manual:')) return handleManualConfirmation(interaction);
    if (interaction.customId.startsWith('manage:')) return handleManage(interaction);
    if (interaction.customId.startsWith('coupon:')) return handleCoupon(interaction);
    if (interaction.customId.startsWith('cfgbot:')) return handleCfgBot(interaction);
    if (interaction.customId.startsWith('cfgcanal:')) return handleCfgCanal(interaction);
    if (interaction.customId === 'ticket:open') return openTicket(interaction);
    if (interaction.customId === 'ticket:close') return closeTicket(interaction);
    if (interaction.customId.startsWith('rate:')) return handleRate(interaction);
    if (interaction.customId === 'perm:toggle') return handlePerm(interaction);
  } catch (err) {
    console.error('Erro em interactionCreate:', err);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erro ao processar botão.', ephemeral: true }).catch(() => {});
  }
});

async function handleBuy(interaction) {
  const id = interaction.customId.split(':')[1];
  const p = database.products[id];
  if (!p) return interaction.reply({ content: '❌ Produto inexistente.', ephemeral: true });
  if (!p.conta?.length) return interaction.reply({ content: '❌ Produto sem estoque.', ephemeral: true });
  const existing = interaction.guild.channels.cache.find(c => c.topic === `cart:${interaction.user.id}:${id}`);
  if (existing) return interaction.reply({ content: `Você já possui um carrinho aberto em ${existing}.`, ephemeral: true });
  const parent = getCfg('categoria') || null;
  const channel = await interaction.guild.channels.create(`🛒・carrinho-${interaction.user.username}`.slice(0, 90), {
    type: 'GUILD_TEXT',
    parent: parent || undefined,
    topic: `cart:${interaction.user.id}:${id}`,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: ['VIEW_CHANNEL'] },
      { id: interaction.user.id, allow: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'], deny: ['SEND_MESSAGES'] },
      { id: client.user.id, allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'MANAGE_CHANNELS', 'READ_MESSAGE_HISTORY'] }
    ]
  });
  const row = new MessageActionRow().addComponents(
    new MessageButton().setCustomId(`cart:pay:${id}:1:none`).setLabel('Continuar').setStyle('PRIMARY'),
    new MessageButton().setCustomId('ticket:close').setLabel('Cancelar').setStyle('DANGER'),
    new MessageButton().setCustomId('cart:dm').setLabel('Testar DM').setStyle('SUCCESS')
  );
  await channel.send({ content: `${interaction.user}`, embeds: [embedBase(`${getCfg('nomebot')} | Termos`, 'Mantenha sua DM aberta para receber o produto.\nNão temos reembolso automático.\nO carrinho pode ser fechado por inatividade.')], components: [row] });
  return interaction.reply({ content: `Carrinho criado em ${channel}.`, ephemeral: true });
}

async function handleCart(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  if (action === 'dm') {
    await interaction.user.send({ embeds: [embedBase(`${getCfg('nomebot')} | Teste DM`, 'Se você recebeu essa mensagem, sua DM está aberta.')] }).catch(() => null);
    return interaction.reply({ content: 'Teste enviado na sua DM.', ephemeral: true });
  }
  if (action === 'paid') {
    const orderId = parts[2];
    const order = database.pendingOrders?.[orderId];
    if (!order) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (order.userId !== interaction.user.id) return interaction.reply({ content: '❌ Esse pedido não é seu.', ephemeral: true });
    order.status = 'aguardando_admin';
    saveDb(database);
    const adminRow = new MessageActionRow().addComponents(
      new MessageButton().setCustomId(`manual:approve:${orderId}`).setLabel('Confirmar pagamento').setStyle('SUCCESS'),
      new MessageButton().setCustomId(`manual:reject:${orderId}`).setLabel('Recusar').setStyle('DANGER')
    );
    const logChannel = interaction.guild.channels.cache.get(getCfg('logs'));
    const adminMsg = { embeds: [embedBase('Confirmação de pagamento pendente', `Cliente: ${interaction.user}\nPedido: \`${orderId}\`\nProduto: **${order.productName}**\nQuantidade: **${order.qtd}**\nValor: **R$${Number(order.total).toFixed(2)}**\n\nConfira o comprovante neste carrinho e clique em confirmar para entregar automaticamente.`)], components: [adminRow] };
    await interaction.channel.send(adminMsg);
    if (logChannel && logChannel.id !== interaction.channel.id) await logChannel.send(adminMsg).catch(() => {});
    return interaction.reply({ content: '✅ Aviso enviado para a staff. Aguarde a confirmação.', ephemeral: true });
  }
  const id = parts[2];
  let qtd = Number(parts[3] || 1);
  let cupomCode = parts[4] === 'none' ? null : parts[4];
  const p = database.products[id];
  if (!p) return interaction.reply({ content: '❌ Produto inexistente.', ephemeral: true });
  if (action === 'add') qtd = Math.min(qtd + 1, p.conta.length);
  if (action === 'remove') qtd = Math.max(qtd - 1, 1);
  if (action === 'coupon') {
    await interaction.reply({ content: 'Envie o código do cupom neste canal.', ephemeral: true });
    await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SEND_MESSAGES: true }).catch(() => {});
    const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 30000 });
    await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SEND_MESSAGES: false }).catch(() => {});
    const msg = collected.first();
    if (!msg) return;
    cupomCode = msg.content.trim().toUpperCase();
    await msg.delete().catch(() => {});
    const cupom = database.coupons[cupomCode];
    if (!cupom || Number(cupom.quantidade) <= 0) return interaction.followUp({ content: '❌ Cupom inválido ou sem usos.', ephemeral: true });
  }
  const subtotal = Number(p.preco) * qtd;
  const cupom = cupomCode ? database.coupons[cupomCode] : null;
  const desconto = cupom && subtotal >= Number(cupom.minimo) ? Number(cupom.desconto) : 0;
  const total = subtotal - (subtotal * desconto / 100);
  const row = new MessageActionRow().addComponents(
    new MessageButton().setCustomId(`cart:coupon:${id}:${qtd}:${cupomCode || 'none'}`).setLabel('Cupom').setStyle('SUCCESS'),
    new MessageButton().setCustomId(`cart:remove:${id}:${qtd}:${cupomCode || 'none'}`).setLabel('-').setStyle('SECONDARY'),
    new MessageButton().setCustomId(`cart:finish:${id}:${qtd}:${cupomCode || 'none'}`).setLabel('Pagar').setStyle('PRIMARY'),
    new MessageButton().setCustomId(`cart:add:${id}:${qtd}:${cupomCode || 'none'}`).setLabel('+').setStyle('SECONDARY'),
    new MessageButton().setCustomId('ticket:close').setLabel('Cancelar').setStyle('DANGER')
  );
  const embed = embedBase(`${getCfg('nomebot')} | Carrinho`, `Produto: **${p.nome}**\nQuantidade: **${qtd}**\nSubtotal: **R$${subtotal.toFixed(2)}**\nCupom: **${cupomCode || 'Nenhum'}**\nDesconto: **${desconto}%**\nTotal: **R$${total.toFixed(2)}**`);
  if (action !== 'finish') {
    if (interaction.deferred || interaction.replied) return interaction.message.edit({ embeds: [embed], components: [row] });
    return interaction.update({ embeds: [embed], components: [row] });
  }
  await interaction.deferUpdate();
  const pixKey = getCfg('pixKey') || 'Configure a chave Pix em `configbot` ou na variável PIX_KEY do Railway.';
  const orderId = `PED-${Date.now()}-${interaction.user.id.slice(-4)}`;
  database.pendingOrders[orderId] = {
    id: orderId,
    userId: interaction.user.id,
    username: interaction.user.tag,
    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
    productId: id,
    productName: p.nome,
    qtd,
    total: Number(total.toFixed(2)),
    cupomCode,
    status: 'aguardando_pagamento',
    createdAt: new Date().toISOString()
  };
  saveDb(database);

  const payRow = new MessageActionRow().addComponents(
    new MessageButton().setCustomId(`cart:paid:${orderId}`).setLabel('Já paguei').setStyle('SUCCESS').setEmoji('✅'),
    new MessageButton().setCustomId('ticket:close').setLabel('Cancelar').setStyle('DANGER')
  );

  return interaction.channel.send({
    embeds: [embedBase('Pagamento semi automático', `Produto: **${p.nome}**\nQuantidade: **${qtd}**\nTotal: **R$${total.toFixed(2)}**\nID do pedido: \`${orderId}\`\n\nFaça o Pix na chave abaixo:\n\`${pixKey}\`\n\nDepois envie o comprovante neste carrinho e clique em **Já paguei**. Um administrador vai conferir e liberar a entrega.`)],
    components: [payRow]
  });
}

async function handleManualConfirmation(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Apenas administradores podem confirmar pagamentos.', ephemeral: true });
  const [, action, orderId] = interaction.customId.split(':');
  const order = database.pendingOrders?.[orderId];
  if (!order) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
  if (order.status === 'aprovado') return interaction.reply({ content: 'Esse pedido já foi aprovado.', ephemeral: true });
  if (order.status === 'recusado') return interaction.reply({ content: 'Esse pedido já foi recusado.', ephemeral: true });

  const cartChannel = interaction.guild.channels.cache.get(order.channelId) || interaction.channel;
  const buyer = await interaction.guild.members.fetch(order.userId).catch(() => null);
  if (action === 'reject') {
    order.status = 'recusado';
    order.rejectedBy = interaction.user.id;
    order.rejectedAt = new Date().toISOString();
    saveDb(database);
    await cartChannel.send({ embeds: [embedBase('Pagamento recusado', `O pagamento do pedido \`${orderId}\` foi recusado pela staff. Confira o comprovante ou fale com um administrador.`)] }).catch(() => {});
    return interaction.update({ content: `❌ Pedido ${orderId} recusado.`, embeds: [], components: [] });
  }

  if (!buyer) return interaction.reply({ content: '❌ Não consegui localizar o comprador no servidor.', ephemeral: true });
  order.status = 'aprovado';
  order.approvedBy = interaction.user.id;
  order.approvedAt = new Date().toISOString();
  saveDb(database);
  await finishPurchase({
    user: buyer.user,
    member: buyer,
    guild: interaction.guild,
    channel: cartChannel
  }, order.productId, Number(order.qtd), Number(order.total), orderId, order.cupomCode);
  return interaction.update({ content: `✅ Pedido ${orderId} confirmado e entregue.`, embeds: [], components: [] });
}

async function finishPurchase(interaction, id, qtd, total, paymentId, cupomCode) {
  const p = database.products[id];
  if (!p || p.conta.length < qtd) return interaction.channel.send('❌ Estoque acabou antes da entrega. Chame a staff.');
  const removed = p.conta.splice(0, qtd);
  if (cupomCode && database.coupons[cupomCode]) database.coupons[cupomCode].quantidade = Math.max(0, Number(database.coupons[cupomCode].quantidade) - 1);
  addStats(total);
  saveDb(database);
  await interaction.user.send({ embeds: [embedBase('Compra realizada!', `Produto: **${p.nome}**\nValor: **R$${total.toFixed(2)}**\nID da compra: \`${paymentId}\`\n\nEntrega:\n\`\`\`${removed.join('\n')}\`\`\``)] }).catch(() => null);
  const cargo = getCfg('cargo');
  if (cargo) await interaction.member.roles.add(cargo).catch(() => {});
  await interaction.channel.send({ embeds: [embedBase('Compra aprovada', `Verifique sua DM para receber o produto **${p.nome}**. Este canal será fechado em 5 minutos.`)] });
  const logChannel = interaction.guild.channels.cache.get(getCfg('logs'));
  if (logChannel) logChannel.send({ embeds: [embedBase('Nova compra aprovada', `Comprador: ${interaction.user.tag}\nProduto: ${p.nome}\nValor: R$${total.toFixed(2)}\nQuantidade: ${qtd}\nID: ${paymentId}`)] }).catch(() => {});
  setTimeout(() => interaction.channel.delete().catch(() => {}), 300000);
}

async function handleManage(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
  const [, action, id] = interaction.customId.split(':');
  const p = database.products[id];
  if (!p) return interaction.reply({ content: 'Produto inexistente.', ephemeral: true });
  if (action === 'delete') {
    delete database.products[id];
    saveDb(database);
    await interaction.update({ content: '✅ Produto deletado.', embeds: [], components: [] });
    return;
  }
  await interaction.reply({ content: action === 'estoque' ? 'Envie itens de estoque, um por mensagem. Digite `finalizar` para terminar.' : `Envie o novo valor para ${action}.`, ephemeral: true });
  await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SEND_MESSAGES: true }).catch(() => {});
  if (action === 'estoque') {
    const collector = interaction.channel.createMessageCollector({ filter: m => m.author.id === interaction.user.id, time: 120000 });
    collector.on('collect', async m => {
      if (m.content.toLowerCase() === 'finalizar') {
        await m.delete().catch(() => {});
        collector.stop('done');
        return;
      }
      p.conta.push(m.content);
      saveDb(database);
      await m.delete().catch(() => {});
    });
    collector.on('end', async () => {
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SEND_MESSAGES: false }).catch(() => {});
      await interaction.followUp({ content: `✅ Estoque atualizado. Quantidade atual: ${p.conta.length}`, ephemeral: true }).catch(() => {});
    });
    return;
  }
  const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60000 });
  await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SEND_MESSAGES: false }).catch(() => {});
  const m = collected.first();
  if (!m) return;
  const value = m.content.trim();
  await m.delete().catch(() => {});
  if (action === 'preco') {
    const preco = parsePrice(value);
    if (preco === null) return interaction.followUp({ content: 'Preço inválido.', ephemeral: true });
    p.preco = preco;
  }
  if (action === 'nome') p.nome = value;
  if (action === 'desc') p.desc = value;
  saveDb(database);
  return interaction.followUp({ content: '✅ Produto atualizado.', ephemeral: true });
}

async function handleCoupon(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
  const [, action, code] = interaction.customId.split(':');
  const c = database.coupons[code];
  if (!c) return interaction.reply({ content: 'Cupom inexistente.', ephemeral: true });
  if (action === 'del') {
    delete database.coupons[code];
    saveDb(database);
    return interaction.update({ content: '✅ Cupom excluído.', embeds: [], components: [] });
  }
  if (action === 'rel') return interaction.update({ embeds: [couponEmbed(code)] });
  await interaction.reply({ content: 'Envie o novo valor.', ephemeral: true });
  const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60000 });
  const m = collected.first();
  if (!m) return;
  const value = Number(m.content.replace(',', '.'));
  await m.delete().catch(() => {});
  if (!Number.isFinite(value) || value < 0) return interaction.followUp({ content: 'Valor inválido.', ephemeral: true });
  if (action === 'qtd') c.quantidade = value;
  if (action === 'min') c.minimo = value;
  if (action === 'pct') c.desconto = value;
  saveDb(database);
  return interaction.followUp({ content: '✅ Cupom atualizado.', ephemeral: true });
}

async function handleCfgBot(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
  const action = interaction.customId.split(':')[1];
  const prompts = { nome: 'Envie o novo nome do bot.', cargo: 'Envie o ID do cargo cliente.', pix: 'Envie sua chave Pix para pagamentos manuais.', cor: 'Envie a cor HEX. Exemplo: #00ff00' };
  await interaction.reply({ content: prompts[action], ephemeral: true });
  const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60000 });
  const m = collected.first();
  if (!m) return;
  const value = m.content.trim();
  await m.delete().catch(() => {});
  if (action === 'nome') setCfg('nomebot', value);
  if (action === 'cargo') setCfg('cargo', value.replace(/[<@&>]/g, ''));
  if (action === 'pix') setCfg('pixKey', value);
  if (action === 'cor') setCfg('cor', value);
  return interaction.followUp({ content: '✅ Configuração salva.', ephemeral: true });
}

async function handleCfgCanal(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
  const action = interaction.customId.split(':')[1];
  const prompts = { logs: 'Envie o ID do canal de logs.', categoria: 'Envie o ID da categoria de carrinhos.', imagem: 'Envie o link da imagem larga.', admin: 'Envie o ID do cargo ADM.' };
  await interaction.reply({ content: prompts[action], ephemeral: true });
  const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60000 });
  const m = collected.first();
  if (!m) return;
  const value = m.content.trim();
  await m.delete().catch(() => {});
  if (action === 'logs') setCfg('logs', value.replace(/[<#>]/g, ''));
  if (action === 'categoria') setCfg('categoria', value.replace(/[<#>]/g, ''));
  if (action === 'imagem') setCfg('imagem', value);
  if (action === 'admin') setCfg('adminRoleId', value.replace(/[<@&>]/g, ''));
  return interaction.followUp({ content: '✅ Configuração salva.', ephemeral: true });
}

async function openTicket(interaction) {
  const existing = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username.toLowerCase()}` || c.topic === `ticket:${interaction.user.id}`);
  if (existing) return interaction.reply({ content: `Você já possui ticket aberto em ${existing}.`, ephemeral: true });
  const channel = await interaction.guild.channels.create(`ticket-${interaction.user.username}`.slice(0, 90), {
    type: 'GUILD_TEXT',
    topic: `ticket:${interaction.user.id}`,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: ['VIEW_CHANNEL'] },
      { id: interaction.user.id, allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES', 'READ_MESSAGE_HISTORY'] },
      { id: client.user.id, allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'MANAGE_CHANNELS', 'READ_MESSAGE_HISTORY'] }
    ]
  });
  const row = new MessageActionRow().addComponents(new MessageButton().setCustomId('ticket:close').setLabel('Fechar Ticket').setStyle('DANGER').setEmoji('🔒'));
  await channel.send({ content: `${interaction.user}`, embeds: [embedBase('Ticket aberto', 'Explique claramente o que precisa. A staff responderá em breve.')], components: [row] });
  return interaction.reply({ content: `Ticket aberto em ${channel}.`, ephemeral: true });
}

async function closeTicket(interaction) {
  await interaction.reply(`🔒 ${interaction.user}, este canal será fechado em 5 segundos...`).catch(() => {});
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

async function handleRate(interaction) {
  const stars = interaction.customId.split(':')[1] === '5' ? '⭐⭐⭐⭐⭐' : '⭐⭐⭐';
  database.ratings.push({ user: interaction.user.id, stars, date: new Date().toISOString() });
  saveDb(database);
  await interaction.reply({ content: '✅ Obrigado pela avaliação!', ephemeral: true });
  return interaction.channel.send({ embeds: [embedBase(`${getCfg('nomebot')} | Nova avaliação`, `${interaction.user}\n\n${stars}`)] });
}

async function handlePerm(interaction) {
  const roleId = getCfg('permRoleId') || getCfg('adminRoleId');
  if (!roleId) return interaction.reply({ content: 'Cargo de permissão não configurado.', ephemeral: true });
  if (interaction.member.roles.cache.has(roleId)) {
    await interaction.member.roles.remove(roleId).catch(() => {});
    return interaction.reply({ content: `Você perdeu o cargo <@&${roleId}>.`, ephemeral: true });
  }
  await interaction.member.roles.add(roleId).catch(() => {});
  return interaction.reply({ content: `Você recebeu o cargo <@&${roleId}>.`, ephemeral: true });
}

client.once('ready', async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
  client.user.setActivity('Loja automática', { type: 'PLAYING' });
  const canalVoz = getCfg('canalVoz');
  if (canalVoz) {
    try {
      const { joinVoiceChannel } = require('@discordjs/voice');
      const channel = client.channels.cache.get(canalVoz);
      if (channel) joinVoiceChannel({ channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator });
    } catch (err) {
      console.log('Canal de voz ignorado. Instale @discordjs/voice se quiser usar voz.');
    }
  }
});

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

if (!process.env.TOKEN) {
  console.error('❌ TOKEN não configurado nas variáveis de ambiente.');
  process.exit(1);
}
client.login(process.env.TOKEN);
