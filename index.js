require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// CAD Routes
const cadRoutes = require('./cadRoutes');
app.use('/api/cad', cadRoutes);

// DTU Routes
const dtuRoutes = require('./dtuRoutes');
app.use('/api/dtu', dtuRoutes);

// --- DISCORD BOT SETUP ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

client.once('ready', async () => {
  console.log(`Discord Bot logged in as ${client.user.tag}`);
  
  // Rejestracja Slash Command
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const commandManager = guildId 
      ? (await client.guilds.fetch(guildId)).commands 
      : client.application.commands;

    await commandManager.create({
      name: 'setup-podania',
      description: 'Generuje interaktywny panel podań do LSPD w aktualnym kanale.',
      defaultMemberPermissions: '8', // 8 = Administrator
    });
    
    await commandManager.create({
      name: 'setup-szkolenia',
      description: 'Generuje interaktywny panel szkoleń FTD w aktualnym kanale.',
      defaultMemberPermissions: '8', // 8 = Administrator
    });

    await commandManager.create({
      name: 'setup-tickety-ftd',
      description: 'Generuje panel do otwierania ticketów na szkolenia FTD.',
      defaultMemberPermissions: '8', // 8 = Administrator
    });

    await commandManager.create({
      name: 'setup-tickety-ftd',
      description: 'Generuje panel do otwierania ticketów na szkolenia FTD.',
      defaultMemberPermissions: '8', // 8 = Administrator
    });

    await commandManager.create({
      name: 'setup-egzamin-oficerski',
      description: 'Generuje panel do otwierania ticketów na egzamin oficerski.',
      defaultMemberPermissions: '8', // 8 = Administrator
    });

    await commandManager.create({
      name: 'setup-tickety-lspd',
      description: 'Generuje główny panel ticketów LSPD.',
      defaultMemberPermissions: '8', // 8 = Administrator
    });

    await commandManager.create({
      name: 'setup-urlopy',
      description: 'Generuje panel do zgłaszania urlopów.',
      defaultMemberPermissions: '8', // 8 = Administrator
    });
    console.log('Slash commands zostały zarejestrowane.');
  } catch (error) {
    console.error('Błąd podczas rejestracji slash commands:', error);
  }
});

// Zaloguj bota, jeśli token istnieje
if (process.env.DISCORD_TOKEN) {
  client.login(process.env.DISCORD_TOKEN);
} else {
  console.warn('Brak DISCORD_TOKEN w .env. Bot się nie uruchomił.');
}

// --- DISCORD REKRUTACJA (PODANIA) ---
client.on('interactionCreate', async (interaction) => {

  // --- DISCORD URLOPY ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-urlopy') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'Nie masz uprawnień administratora.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🌴 Panel Wniosków o Urlop')
      .setDescription('Złóż wniosek o urlop. Twój wniosek trafi prosto do Zarządu. Po akceptacji zostanie automatycznie naniesiony w Kalendarzu na stronie MDT.\n\nKliknij przycisk poniżej, aby wypełnić formularz.')
      .setColor(0x10b981)
      .setFooter({ text: 'LSPD HR System' });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('btn_request_leave')
          .setLabel('🌴 Złóż Wniosek o Urlop')
          .setStyle(ButtonStyle.Success)
      );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Panel urlopów ustawiony!', ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'btn_request_leave') {
    const modal = new ModalBuilder()
      .setCustomId('modal_leave_request')
      .setTitle('Wniosek o Urlop');

    const nameInput = new TextInputBuilder()
      .setCustomId('leave_name')
      .setLabel('Imię i Nazwisko [Odznaka]:')
      .setPlaceholder('np. Jan Kowalski [04]')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const startInput = new TextInputBuilder()
      .setCustomId('leave_start')
      .setLabel('Data rozpoczęcia (DD.MM.YYYY):')
      .setPlaceholder('np. 24.06.2026')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const endInput = new TextInputBuilder()
      .setCustomId('leave_end')
      .setLabel('Data zakończenia (DD.MM.YYYY):')
      .setPlaceholder('np. 30.06.2026')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId('leave_reason')
      .setLabel('Powód urlopu:')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(startInput),
      new ActionRowBuilder().addComponents(endInput),
      new ActionRowBuilder().addComponents(reasonInput)
    );

    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_leave_request') {
    const name = interaction.fields.getTextInputValue('leave_name');
    const start = interaction.fields.getTextInputValue('leave_start');
    const end = interaction.fields.getTextInputValue('leave_end');
    const reason = interaction.fields.getTextInputValue('leave_reason');

    const leavesChannelId = process.env.DISCORD_LEAVES_CHANNEL_ID;
    if (!leavesChannelId) {
      return interaction.reply({ content: 'Błąd: Kanał urlopów nie jest skonfigurowany w .env!', ephemeral: true });
    }

    const hcChannel = await client.channels.fetch(leavesChannelId).catch(() => null);
    if (!hcChannel) {
      return interaction.reply({ content: 'Błąd: Kanał urlopów nie istnieje.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('Nowy Wniosek o Urlop')
      .setDescription(`**Funkcjonariusz:** ${name}\n**Od:** ${start}\n**Do:** ${end}\n**Powód:**\n${reason}\n\n**Discord ID:** <@${interaction.user.id}>`)
      .setColor(0xfbbf24)
      .setFooter({ text: `ID: ${Date.now()}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_leave_approve').setLabel('Zatwierdź').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('btn_leave_deny').setLabel('Odrzuć').setStyle(ButtonStyle.Danger)
    );

    await hcChannel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Wniosek został wysłany do Zarządu.', ephemeral: true });
  }

  if (interaction.isButton() && (interaction.customId === 'btn_leave_approve' || interaction.customId === 'btn_leave_deny')) {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.has(process.env.DISCORD_HC_ROLE_ID)) {
      return interaction.reply({ content: 'Brak uprawnień do weryfikacji.', ephemeral: true });
    }

    const embed = interaction.message.embeds[0];
    const isApprove = interaction.customId === 'btn_leave_approve';
    
    const updatedEmbed = EmbedBuilder.from(embed)
      .setColor(isApprove ? 0x10b981 : 0xef4444)
      .addFields({ name: 'Status', value: isApprove ? `Zatwierdzony przez ${interaction.user.tag}` : `Odrzucony przez ${interaction.user.tag}` });
    
    await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

    if (isApprove) {
      const desc = embed.description;
      const lines = desc.split('\n');
      const nameLine = lines.find(l => l.startsWith('**Funkcjonariusz:**'))?.replace('**Funkcjonariusz:**', '').trim() || 'Nieznany';
      const startLine = lines.find(l => l.startsWith('**Od:**'))?.replace('**Od:**', '').trim() || '';
      const endLine = lines.find(l => l.startsWith('**Do:**'))?.replace('**Do:**', '').trim() || '';
      const reasonPart = desc.split('**Powód:**\n')[1]?.split('\n\n**Discord ID:**')[0] || '';

      let officerName = nameLine;
      let badgeNumber = '';
      const badgeMatch = nameLine.match(/\[(\d+)\]/);
      if (badgeMatch) {
        badgeNumber = badgeMatch[1];
        officerName = nameLine.replace(/\s*\[\d+\]\s*/, '').trim();
      }

      const parseDate = (d) => {
        const parts = d.split('.');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}T00:00:00.000Z`;
        return new Date().toISOString();
      };

      const newLeave = {
        id: Date.now().toString(),
        officerName,
        badgeNumber,
        startDate: parseDate(startLine),
        endDate: parseDate(endLine),
        reason: reasonPart,
        createdAt: new Date().toISOString()
      };

      const leavesFile = path.join(__dirname, 'data', 'leaves.json');
      let leaves = [];
      try { if (fs.existsSync(leavesFile)) leaves = JSON.parse(fs.readFileSync(leavesFile, 'utf8')); } catch(e){}
      leaves.push(newLeave);
      fs.writeFileSync(leavesFile, JSON.stringify(leaves, null, 2));
    }

    await interaction.reply({ content: `Wniosek został ${isApprove ? 'zatwierdzony i dodany do kalendarza' : 'odrzucony'}.`, ephemeral: true });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-podania') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'Nie masz uprawnień administratora.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🚔 Dołącz do LSPD bądź BCSO')
      .setDescription('Hej! Jeśli szukasz miejsca, w którym liczy się profesjonalizm, dobra zabawa i luźne podejście do służby — czekamy właśnie na Ciebie!\n\nMasz chęć spróbować swoich sił w roli funkcjonariusza? Chcesz rozwijać swoją postać, brać udział w dynamicznych akcjach i tworzyć wspaniałe wspomnienia?\n\nKliknij przycisk poniżej, aby otrzymać rolę i dołączyć do naszych szeregów!')
      .setColor(0x3b82f6)
      .setFooter({ text: 'MDT Automated System' });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('apply_lspd')
          .setLabel('📝 Złóż Podanie')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Panel rekrutacyjny został ustawiony pomyślnie!', ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'apply_lspd') {
    const modal = new ModalBuilder()
      .setCustomId('application_modal')
      .setTitle('Podanie do LSPD');

    const ageInput = new TextInputBuilder()
      .setCustomId('ooc_age')
      .setLabel('Wiek OOC:')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const mutationInput = new TextInputBuilder()
      .setCustomId('mutation')
      .setLabel('Czy posiadasz mutacje:')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const expFPInput = new TextInputBuilder()
      .setCustomId('exp_fp')
      .setLabel('Doświadczenie jako FP [IC]')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const whyJoinInput = new TextInputBuilder()
      .setCustomId('why_join')
      .setLabel('Dlaczego powinieneś zostać przyjęty? [IC]')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const expRPInput = new TextInputBuilder()
      .setCustomId('exp_rp')
      .setLabel('Doświadczenie w RP [OOC]')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(ageInput),
      new ActionRowBuilder().addComponents(mutationInput),
      new ActionRowBuilder().addComponents(expFPInput),
      new ActionRowBuilder().addComponents(whyJoinInput),
      new ActionRowBuilder().addComponents(expRPInput)
    );

    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'application_modal') {
    const oocAge = interaction.fields.getTextInputValue('ooc_age');
    const mutation = interaction.fields.getTextInputValue('mutation');
    const expFP = interaction.fields.getTextInputValue('exp_fp');
    const whyJoin = interaction.fields.getTextInputValue('why_join');
    const expRP = interaction.fields.getTextInputValue('exp_rp');

    await interaction.reply({ content: '✅ Twoje podanie zostało wysłane. Oczekuj na odpowiedź administracji.', ephemeral: true });

    const channelId = process.env.DISCORD_APPLICATIONS_CHANNEL_ID;
    if (!channelId) {
      console.error('Brak DISCORD_APPLICATIONS_CHANNEL_ID w .env');
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(`Nowe podanie: LSPD/BCSO`)
        .addFields(
          { name: '👤 Osoba', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: false },
          { name: '🎂 Wiek OOC', value: oocAge, inline: true },
          { name: '🗣️ Mutacja', value: mutation, inline: true },
          { name: '👮 Doświadczenie FP [IC]', value: expFP, inline: false },
          { name: '❓ Dlaczego ty? [IC]', value: whyJoin, inline: false },
          { name: '🎭 Doświadczenie RP [OOC]', value: expRP, inline: false }
        )
        .setColor(0xf59e0b)
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`app_accept_${interaction.user.id}`)
            .setLabel('✅ Akceptuj')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`app_reject_${interaction.user.id}`)
            .setLabel('❌ Odrzuć')
            .setStyle(ButtonStyle.Danger)
        );

      await channel.send({ embeds: [embed], components: [row] });
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith('app_accept_')) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'Brak uprawnień.', ephemeral: true });
    }
    const userId = interaction.customId.split('_')[2];
    
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x2ecc71)
      .setTitle(`${interaction.message.embeds[0].title} (ZAAKCEPTOWANE)`);

    await interaction.update({ embeds: [embed], components: [] });
    
    try {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) {
        const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'rekrut');
        if (role) {
          await member.roles.add(role);
        } else {
          await interaction.followUp({ content: 'Podanie zaakceptowane, ale nie mogłem nadać rangi "rekrut" (rola o takiej nazwie nie istnieje).', ephemeral: true });
        }
      }

      const user = await client.users.fetch(userId);
      await user.send('🎉 Twoje podanie do LSPD zostało **zaakceptowane**! Zgłoś się na kanałach rekrutacyjnych.');
    } catch (err) {
      await interaction.followUp({ content: 'Zatwierdzono, ale wystąpił problem (np. użytkownik ma zablokowane DM).', ephemeral: true });
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith('app_reject_')) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'Brak uprawnień.', ephemeral: true });
    }
    const userId = interaction.customId.split('_')[2];
    
    const modal = new ModalBuilder()
      .setCustomId(`reject_modal_${userId}`)
      .setTitle('Odrzucenie podania');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reject_reason')
      .setLabel('Powód odrzucenia:')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('reject_modal_')) {
    const userId = interaction.customId.split('_')[2];
    const rejectReason = interaction.fields.getTextInputValue('reject_reason');

    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0xe74c3c)
      .setTitle(`${interaction.message.embeds[0].title} (ODRZUCONE)`)
      .addFields({ name: '❌ Powód odrzucenia', value: rejectReason, inline: false });

    await interaction.update({ embeds: [embed], components: [] });
    
    try {
      const user = await client.users.fetch(userId);
      await user.send(`❌ Niestety, Twoje podanie do LSPD zostało **odrzucone**.\n**Powód:** ${rejectReason}`);
    } catch (err) {
      await interaction.followUp({ content: 'Odrzucono, ale użytkownik ma zablokowane wiadomości prywatne.', ephemeral: true });
    }
  }

  // --- FTD SYSTEM SZKOLEŃ ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-szkolenia') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'Nie masz uprawnień administratora.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎓 System Szkoleń FTD')
      .setDescription('Wybierz szkolenie z listy poniżej, aby zarejestrować jego zaliczenie.\n\nDostępne szkolenia:\n• SEU\n• SV\n• NT\n• PWC\n• WU\n• K9\n• ASU\n• Mary\n\nPo wybraniu szkolenia wypełnij formularz z imieniem i nazwiskiem zdającego oraz szkoleniowca.\nWniosek trafi do weryfikacji przez szkoleniowców.')
      .setColor(0x8e44ad)
      .setFooter({ text: 'FTD Automated System' });

    const select = new StringSelectMenuBuilder()
      .setCustomId('ftd_training_select')
      .setPlaceholder('Wybierz szkolenie...')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('SEU').setValue('SEU'),
        new StringSelectMenuOptionBuilder().setLabel('SV').setValue('SV'),
        new StringSelectMenuOptionBuilder().setLabel('NT').setValue('NT'),
        new StringSelectMenuOptionBuilder().setLabel('PWC').setValue('PWC'),
        new StringSelectMenuOptionBuilder().setLabel('WU').setValue('WU'),
        new StringSelectMenuOptionBuilder().setLabel('K9').setValue('K9'),
        new StringSelectMenuOptionBuilder().setLabel('ASU').setValue('ASU'),
        new StringSelectMenuOptionBuilder().setLabel('Mary').setValue('Mary')
      );

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Panel szkoleń został ustawiony pomyślnie!', ephemeral: true });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'ftd_training_select') {
    const selectedTraining = interaction.values[0];
    
    const modal = new ModalBuilder()
      .setCustomId(`ftd_modal_${selectedTraining}`)
      .setTitle(`Zaliczenie: ${selectedTraining}`);

    const traineeInput = new TextInputBuilder()
      .setCustomId('ftd_trainee')
      .setLabel('Imię i nazwisko zdającego (IC)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const trainerInput = new TextInputBuilder()
      .setCustomId('ftd_trainer')
      .setLabel('Imię i nazwisko szkoleniowca (IC)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(traineeInput),
      new ActionRowBuilder().addComponents(trainerInput)
    );

    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('ftd_modal_')) {
    const trainingType = interaction.customId.replace('ftd_modal_', '');
    const trainee = interaction.fields.getTextInputValue('ftd_trainee');
    const trainer = interaction.fields.getTextInputValue('ftd_trainer');

    await interaction.reply({ content: '✅ Wniosek o zaliczenie szkolenia został przesłany do weryfikacji.', ephemeral: true });

    const channelId = process.env.DISCORD_FTD_CHANNEL_ID;
    if (!channelId) {
      console.error('Brak DISCORD_FTD_CHANNEL_ID w .env');
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(`Weryfikacja szkolenia: ${trainingType}`)
        .addFields(
          { name: '🎓 Szkolenie', value: trainingType, inline: true },
          { name: '👮 Zgłaszający', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📝 Zdający (IC)', value: trainee, inline: false },
          { name: '👨‍🏫 Szkoleniowiec (IC)', value: trainer, inline: false }
        )
        .setColor(0xf1c40f)
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ftd_accept_${trainingType}_${interaction.user.id}`)
            .setLabel('✅ Potwierdzam')
            .setStyle(ButtonStyle.Success)
        );

      await channel.send({ embeds: [embed], components: [row] });
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith('ftd_accept_')) {
    // Only verify it's a trainer clicking? They are in the trainer channel, so it's fine.
    const parts = interaction.customId.split('_');
    const trainingType = parts[2];
    const submitterId = parts[3];

    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x2ecc71)
      .setTitle(`ZALICZONE: ${trainingType}`);

    await interaction.update({ embeds: [embed], components: [] });

    const logsChannelId = process.env.DISCORD_FTD_LOGS_CHANNEL_ID;
    if (logsChannelId) {
      const logsChannel = await client.channels.fetch(logsChannelId).catch(() => null);
      if (logsChannel) {
        const traineeField = embed.data.fields.find(f => f.name.includes('Zdający')).value;
        const trainerField = embed.data.fields.find(f => f.name.includes('Szkoleniowiec')).value;
        
        const logEmbed = new EmbedBuilder()
          .setTitle(`🎓 Zaliczenie szkolenia: ${trainingType}`)
          .setDescription(`Zaliczenie zostało potwierdzone przez <@${interaction.user.id}>.`)
          .addFields(
            { name: '📝 Zdający (IC)', value: traineeField, inline: true },
            { name: '👨‍🏫 Szkoleniowiec (IC)', value: trainerField, inline: true }
          )
          .setColor(0x2ecc71)
          .setTimestamp();

        await logsChannel.send({ embeds: [logEmbed] });
      }
    }
    try {
      const member = await interaction.guild.members.fetch(submitterId).catch(() => null);
      if (member) {
        const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === trainingType.toLowerCase());
        if (role) {
          await member.roles.add(role);
        } else {
          await interaction.followUp({ content: `Podanie zaakceptowane, ale nie mogłem nadać rangi "${trainingType}" - rola o takiej nazwie nie istnieje.`, ephemeral: true });
        }
      }

      const user = await client.users.fetch(submitterId);
      await user.send(`🎉 Twój wniosek o szkolenie **${trainingType}** został zatwierdzony przez szkoleniowca i otrzymałeś odpowiednią rangę!`);
    } catch (err) {
      // ignore DM errors
    }
  }

  // --- FTD TICKETY ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-tickety-ftd') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'Nie masz uprawnień administratora.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎓 SYSTEM SZKOLEŃ FTD — LSPD')
      .setDescription('Chcesz umówić się na szkolenie?\n\nWybierz szkolenie z listy poniżej, a zostanie dla Ciebie automatycznie utworzony prywatny ticket ze szkoleniowcami uprawnionymi do jego przeprowadzenia.\n\nSzkolenia obowiązkowe ✅ — wymagane do awansu\nSzkolenia nieobowiązkowe 🔵 — dodatkowe uprawnienia\n\nPamiętaj — otwieraj ticket tylko gdy jesteś gotowy na szkolenie.')
      .setColor(0x3498db)
      .setFooter({ text: 'Los Santos Police Department · FTD Ticket System' })
      .setTimestamp();

    const select = new StringSelectMenuBuilder()
      .setCustomId('ftd_ticket_select')
      .setPlaceholder('Wybierz szkolenie...')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('✅ SEU').setValue('SEU'),
        new StringSelectMenuOptionBuilder().setLabel('✅ SV').setValue('SV'),
        new StringSelectMenuOptionBuilder().setLabel('🔵 NT').setValue('NT'),
        new StringSelectMenuOptionBuilder().setLabel('🔵 PWC').setValue('PWC'),
        new StringSelectMenuOptionBuilder().setLabel('🔵 WU').setValue('WU'),
        new StringSelectMenuOptionBuilder().setLabel('🔵 K9').setValue('K9'),
        new StringSelectMenuOptionBuilder().setLabel('🔵 ASU').setValue('ASU'),
        new StringSelectMenuOptionBuilder().setLabel('🔵 Mary').setValue('Mary')
      );

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Panel ticketów został ustawiony pomyślnie!', ephemeral: true });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'ftd_ticket_select') {
    const selectedTraining = interaction.values[0];
    const guild = interaction.guild;
    const user = interaction.user;

    const categoryId = process.env.DISCORD_TICKETS_CATEGORY_ID;
    
    // Szukamy roli FTD po nazwie lub po ID z .env
    let ftdRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'ftd' || r.name.toLowerCase() === 'szkoleniowiec' || r.name.toLowerCase() === 'szkoleniowiec ftd');
    if (!ftdRole && process.env.DISCORD_TRAINER_ROLE_ID) ftdRole = guild.roles.cache.get(process.env.DISCORD_TRAINER_ROLE_ID);
    
    // Szukamy HC / CB po ID z .env, jeśli ustawione
    const hcRole = process.env.DISCORD_HC_ROLE_ID ? guild.roles.cache.get(process.env.DISCORD_HC_ROLE_ID) : null;
    const cbRole = process.env.DISCORD_CB_ROLE_ID ? guild.roles.cache.get(process.env.DISCORD_CB_ROLE_ID) : null;

    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      }
    ];

    if (ftdRole) permissionOverwrites.push({ id: ftdRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    if (hcRole) permissionOverwrites.push({ id: hcRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    if (cbRole) permissionOverwrites.push({ id: cbRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

    try {
      const channel = await guild.channels.create({
        name: `szkolenie-${selectedTraining.toLowerCase()}-${user.username}`,
        type: ChannelType.GuildText,
        parent: categoryId || null,
        permissionOverwrites: permissionOverwrites
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle(`Szkolenie: ${selectedTraining}`)
        .setDescription(`Witaj <@${user.id}>!\nZarząd / Szkoleniowcy zaraz się tobą zajmą.\nOpisz krótko, kiedy masz czas na szkolenie.`)
        .setColor(0x2ecc71);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('🔒 Zamknij Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      let mentionText = `<@${user.id}>`;
      if (ftdRole) mentionText += ` <@&${ftdRole.id}>`;
      
      await channel.send({ content: mentionText, embeds: [ticketEmbed], components: [closeRow] });
      await interaction.reply({ content: `✅ Ticket został utworzony: <#${channel.id}>`, ephemeral: true });

    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Wystąpił błąd podczas tworzenia ticketa.', ephemeral: true });
    }
  }

  // --- EGZAMIN OFICERSKI ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-egzamin-oficerski') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'Nie masz uprawnień administratora.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('📝 EGZAMIN OFICERSKI')
      .setDescription('Chcesz umówić się na egzamin oficerski?\n\nKliknij przycisk poniżej, aby otworzyć ticket i umówić się z prowadzącym na termin egzaminu.')
      .setColor(0xe67e22)
      .setFooter({ text: 'LSPD FTD • Egzamin Oficerski' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_officer_ticket')
        .setLabel('Otwórz Ticket')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Panel egzaminu oficerskiego został ustawiony pomyślnie!', ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'open_officer_ticket') {
    const guild = interaction.guild;
    const user = interaction.user;
    const categoryId = process.env.DISCORD_TICKETS_CATEGORY_ID;
    
    let ftdRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'ftd' || r.name.toLowerCase() === 'szkoleniowiec' || r.name.toLowerCase() === 'szkoleniowiec ftd');
    if (!ftdRole && process.env.DISCORD_TRAINER_ROLE_ID) ftdRole = guild.roles.cache.get(process.env.DISCORD_TRAINER_ROLE_ID);
    
    const hcRole = process.env.DISCORD_HC_ROLE_ID ? guild.roles.cache.get(process.env.DISCORD_HC_ROLE_ID) : null;
    const cbRole = process.env.DISCORD_CB_ROLE_ID ? guild.roles.cache.get(process.env.DISCORD_CB_ROLE_ID) : null;

    const permissionOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ];

    if (ftdRole) permissionOverwrites.push({ id: ftdRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    if (hcRole) permissionOverwrites.push({ id: hcRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    if (cbRole) permissionOverwrites.push({ id: cbRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

    try {
      const channel = await guild.channels.create({
        name: `egzamin-oficerski-${user.username}`,
        type: ChannelType.GuildText,
        parent: categoryId || null,
        permissionOverwrites: permissionOverwrites
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle('Egzamin Oficerski')
        .setDescription(`Witaj <@${user.id}>!\nZarząd / Szkoleniowcy zaraz się tobą zajmą.\nZaproponuj termin egzaminu poniżej.`)
        .setColor(0xe67e22);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('🔒 Zamknij Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      let mentionText = `<@${user.id}>`;
      if (hcRole) mentionText += ` <@&${hcRole.id}>`;
      else if (ftdRole) mentionText += ` <@&${ftdRole.id}>`;
      
      await channel.send({ content: mentionText, embeds: [ticketEmbed], components: [closeRow] });
      await interaction.reply({ content: `✅ Ticket został utworzony: <#${channel.id}>`, ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Wystąpił błąd podczas tworzenia ticketa.', ephemeral: true });
    }
  }

  // --- GŁÓWNE TICKETY LSPD ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-tickety-lspd') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'Nie masz uprawnień administratora.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎫 SYSTEM TICKETÓW — LSPD')
      .setDescription('Witaj w systemie zgłoszeń Los Santos Police Department.\n\nWybierz rodzaj sprawy z listy poniżej, aby otworzyć prywatny ticket z odpowiednim personelem LSPD.\n\n**Dostępne kategorie:**\n📋 Raport o stopień — nadanie stopnia w LSPD\n👮 Pytanie do HC — kontakt z High Command\n📝 Podanie do HWP— Konktakt z HWP\n📝 Podanie na FTO — rekrutacja FTO [od Officer II]\n📝 Podanie do Metro — rekrutacja Metro od Officer III\n\nPamiętaj — otwieraj ticket tylko w uzasadnionych przypadkach.')
      .setColor(0x2b2d31)
      .setFooter({ text: 'Los Santos Police Department' })
      .setTimestamp();

    const select = new StringSelectMenuBuilder()
      .setCustomId('lspd_ticket_select')
      .setPlaceholder('Wybierz rodzaj sprawy...')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('📋 Raport o stopień').setValue('raport').setDescription('Nadanie stopnia w LSPD'),
        new StringSelectMenuOptionBuilder().setLabel('👮 Pytanie do HC').setValue('pytanie').setDescription('Kontakt z High Command'),
        new StringSelectMenuOptionBuilder().setLabel('📝 Podanie do HWP').setValue('hwp').setDescription('Kontakt z HWP'),
        new StringSelectMenuOptionBuilder().setLabel('📝 Podanie na FTO').setValue('fto').setDescription('Rekrutacja FTO [od Officer II]'),
        new StringSelectMenuOptionBuilder().setLabel('📝 Podanie do Metro').setValue('metro').setDescription('Rekrutacja Metro od Officer III')
      );

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Panel głównych ticketów LSPD został ustawiony pomyślnie!', ephemeral: true });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'lspd_ticket_select') {
    const selectedType = interaction.values[0];
    const guild = interaction.guild;
    const user = interaction.user;
    const categoryId = process.env.DISCORD_LSPD_TICKETS_CATEGORY_ID;

    // Pobieranie odpowiednich ról w zaleznosci od wyboru
    const rolesToPing = [];
    const hcRole = process.env.DISCORD_HC_ROLE_ID ? guild.roles.cache.get(process.env.DISCORD_HC_ROLE_ID) : null;
    const cbRole = process.env.DISCORD_CB_ROLE_ID ? guild.roles.cache.get(process.env.DISCORD_CB_ROLE_ID) : null;
    
    let ticketName = 'ticket';
    let welcomeText = 'Opisz krótko swoją sprawę poniżej.';

    if (selectedType === 'raport' || selectedType === 'pytanie') {
      ticketName = selectedType === 'raport' ? `raport-${user.username}` : `pytanie-${user.username}`;
      if (hcRole) rolesToPing.push(hcRole);
      welcomeText = 'Witaj! High Command zaraz się Tobą zajmie.\nProszę, opisz krótko swoją sprawę.';
    } 
    else if (selectedType === 'hwp') {
      ticketName = `hwp-${user.username}`;
      const hwpCommander = guild.roles.cache.find(r => r.name.toLowerCase().includes('hwp commander') || r.name.toLowerCase() === 'hwp commander');
      if (hwpCommander) rolesToPing.push(hwpCommander);
      else if (hcRole) rolesToPing.push(hcRole);
      welcomeText = 'Witaj! HWP Commander zaraz się Tobą zajmie.\nZostaw swoje podanie/pytanie poniżej.';
    }
    else if (selectedType === 'fto') {
      ticketName = `fto-${user.username}`;
      const ftdCommander = guild.roles.cache.find(r => r.name.toLowerCase().includes('ftd commander') || r.name.toLowerCase() === 'ftd commander');
      if (ftdCommander) rolesToPing.push(ftdCommander);
      else if (hcRole) rolesToPing.push(hcRole);
      welcomeText = 'Witaj! FTD Commander zaraz sprawdzi Twoje zgłoszenie.\nZostaw swoje podanie poniżej.';
    }
    else if (selectedType === 'metro') {
      ticketName = `metro-${user.username}`;
      const metroCommander = guild.roles.cache.find(r => r.name.toLowerCase().includes('metro commander') || r.name.toLowerCase() === 'metro commander');
      if (metroCommander) rolesToPing.push(metroCommander);
      else if (hcRole) rolesToPing.push(hcRole);
      welcomeText = 'Witaj! Metro Commander zaraz się Tobą zajmie.\nZostaw swoje podanie poniżej.';
    }

    const permissionOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ];

    rolesToPing.forEach(role => {
      permissionOverwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    });

    try {
      const channel = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: categoryId || null,
        permissionOverwrites: permissionOverwrites
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle(`Ticket: ${selectedType.toUpperCase()}`)
        .setDescription(welcomeText)
        .setColor(0x2b2d31);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('🔒 Zamknij Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      let mentionText = `<@${user.id}>`;
      rolesToPing.forEach(role => { mentionText += ` <@&${role.id}>`; });
      
      await channel.send({ content: mentionText, embeds: [ticketEmbed], components: [closeRow] });
      await interaction.reply({ content: `✅ Ticket został utworzony: <#${channel.id}>`, ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Wystąpił błąd podczas tworzenia ticketa.', ephemeral: true });
    }
  }

  // --- ZAMYKANIE TICKETÓW ---
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: 'Zamykanie ticketa za 5 sekund...' });
    const channelIdToClose = interaction.channelId;
    setTimeout(async () => {
      try {
        const channel = await client.channels.fetch(channelIdToClose);
        if (channel) await channel.delete();
      } catch (err) {
        console.error('Błąd podczas zamykania ticketa:', err);
      }
    }, 5000);
  }

});

// Funkcja do wysyłania ogłoszeń na kanale Discord
const announceAction = async (user, type, oldRank = null, newRank = null, oldBadge = null, newBadge = null, reason = null) => {
  try {
    let channelEnvVar = '';
    switch (type) {
      case 'PROMOTION': channelEnvVar = process.env.DISCORD_PROMOTION_CHANNEL_ID; break;
      case 'DEMOTION': channelEnvVar = process.env.DISCORD_DEMOTION_CHANNEL_ID; break;
      case 'HIRE': channelEnvVar = process.env.DISCORD_HIRE_CHANNEL_ID; break;
      case 'FIRE': channelEnvVar = process.env.DISCORD_FIRE_CHANNEL_ID; break;
    }
    const channelId = channelEnvVar || process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID;
    
    console.log(`[DEBUG] announceAction triggered for ${type}, channelId: ${channelId}`);
    
    if (!channelId || !client.isReady()) {
      console.log(`[DEBUG] announceAction aborted: no channelId or client not ready`);
      return;
    }

    let embedTitle = '';
    let color = 0x000000;
    let fields = [];
    
    const fullName = `${user.firstName} ${user.lastName}`;
    const nickOOC = user.discordId ? `<@${user.discordId}>` : (user.discordNick || 'Brak');

    switch (type) {
      case 'PROMOTION':
        embedTitle = `⬆️ AWANS — ${fullName}`;
        color = 0x2ecc71;
        fields = [
          { name: '👤 Funkcjonariusz', value: fullName, inline: true },
          { name: '🔖 Nick OOC', value: nickOOC, inline: true },
          { name: '📉 Poprzedni stopień', value: oldRank || '-', inline: true },
          { name: '📈 Nowy stopień', value: newRank || '-', inline: true },
          { name: '🪪 Stara odznaka', value: oldBadge ? `#${oldBadge}` : '-', inline: true },
          { name: '🆕 Nowa odznaka', value: newBadge ? `#${newBadge}` : '-', inline: true }
        ];
        if (reason && reason !== 'Brak') fields.push({ name: '📝 Powód', value: reason, inline: false });
        break;
      case 'DEMOTION':
        embedTitle = `⬇️ DEGRADACJA — ${fullName}`;
        color = 0xe74c3c;
        fields = [
          { name: '👤 Funkcjonariusz', value: fullName, inline: true },
          { name: '🔖 Nick OOC', value: nickOOC, inline: true },
          { name: '📉 Poprzedni stopień', value: oldRank || '-', inline: true },
          { name: '📈 Nowy stopień', value: newRank || '-', inline: true },
          { name: '🪪 Stara odznaka', value: oldBadge ? `#${oldBadge}` : '-', inline: true },
          { name: '🆕 Nowa odznaka', value: newBadge ? `#${newBadge}` : '-', inline: true }
        ];
        if (reason && reason !== 'Brak') fields.push({ name: '📝 Powód', value: reason, inline: false });
        break;
      case 'HIRE':
        embedTitle = `🟢 ZATRUDNIENIE — ${fullName}`;
        color = 0x3498db;
        fields = [
          { name: '👤 Funkcjonariusz', value: fullName, inline: true },
          { name: '🔖 Nick OOC', value: nickOOC, inline: true },
          { name: '🪪 Odznaka', value: user.badgeNumber ? `#${user.badgeNumber}` : '-', inline: true },
          { name: '📋 Stopień', value: user.rank || '-', inline: true }
        ];
        break;
      case 'FIRE':
        embedTitle = `🔴 ZWOLNIENIE — ${fullName}`;
        color = 0x992d22;
        fields = [
          { name: '👤 Funkcjonariusz', value: fullName, inline: true },
          { name: '🔖 Nick OOC', value: nickOOC, inline: true },
          { name: '🪪 Odznaka', value: user.badgeNumber ? `#${user.badgeNumber}` : '-', inline: true },
          { name: '📋 Stopień', value: user.rank || '-', inline: true }
        ];
        if (reason && reason !== 'Brak') fields.push({ name: '📝 Powód', value: reason, inline: false });
        break;
    }

    const embed = new EmbedBuilder()
      .setTitle(embedTitle)
      .setColor(color)
      .addFields(fields)
      .setFooter({ text: `${user.department || 'LSPD'} — System zarządzania` })
      .setTimestamp();

    let messageContent = '';
    if (user.discordId) {
      messageContent = `<@${user.discordId}>`;
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel) {
       console.log(`[DEBUG] channel with ID ${channelId} not found`);
       return;
    }

    await channel.send({ content: messageContent, embeds: [embed] });
    console.log(`[DEBUG] Successfully sent ${type} embed to channel ${channelId}`);
  } catch (error) {
    console.error(`Błąd przy ogłaszaniu ${type}:`, error);
  }
};

// Funkcja do synchronizacji nicku na Discordzie
const syncDiscordNickname = async (user) => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId || !client.isReady()) return;

    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;

    let member;
    
    // Szukaj po ID jeśli jest w bazie
    if (user.discordId) {
      try {
        member = await guild.members.fetch(user.discordId);
      } catch (err) {
        // Nie znaleziono po ID
      }
    }

    // Szukaj po nicku (discordNick) podanym w formularzu
    if (!member && user.discordNick) {
      const queryNick = user.discordNick.replace(/^@/, ''); // usuń @ jeśli ktoś wpisał z małpą
      const members = await guild.members.fetch({ query: queryNick, limit: 10 });
      member = members.find(m => 
        m.user.username.toLowerCase() === queryNick.toLowerCase() || 
        m.user.globalName?.toLowerCase() === queryNick.toLowerCase() ||
        m.nickname?.toLowerCase() === queryNick.toLowerCase()
      );
    }

    if (member) {
      const newNickname = `[${user.badgeNumber}] ${user.firstName} ${user.lastName}`;
      // Discord ma limit 32 znaków na nick
      const safeNickname = newNickname.substring(0, 32);
      
      try {
        await member.setNickname(safeNickname, 'Zaktualizowano dane IC funkcjonariusza');
        console.log(`Zaktualizowano nick na DC dla: ${safeNickname}`);
      } catch (err) {
        console.error(`Nie udało się zmienić nicku dla ${safeNickname}: ${err.message}`);
      }
      
      // Zapisz discordId w bazie, by następnym razem szukać szybciej
      if (user.discordId !== member.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { discordId: member.id }
        });
      }

      // --- LOGIKA RÓL ---
      try {
        const rolesData = fs.readFileSync('./roles.json', 'utf8');
        const rolesConfig = JSON.parse(rolesData);
        
        const rolesToAdd = [];
        const rolesToRemove = [];

        // 1. Zbieramy WSZYSTKIE możliwe role jednostek i stopni
        if (rolesConfig.baseRoles) {
          Object.values(rolesConfig.baseRoles).forEach(r => { if (r) rolesToRemove.push(r); });
        }
        if (rolesConfig.ranks) {
          Object.values(rolesConfig.ranks).forEach(deptRanks => {
            Object.values(deptRanks).forEach(r => { if (r) rolesToRemove.push(r); });
          });
        }

        // 2. Dodajemy rolę docelową jednostki
        const expectedBaseRole = rolesConfig.baseRoles?.[user.department];
        if (expectedBaseRole) rolesToAdd.push(expectedBaseRole);
        
        // Dodatek: Zgodnie z wytycznymi, BCSO otrzymuje również rolę LSPD
        if (user.department === 'BCSO' && rolesConfig.baseRoles?.['LSPD']) {
          rolesToAdd.push(rolesConfig.baseRoles['LSPD']);
        }

        // 3. Dodajemy rolę docelową stopnia
        const expectedRankRole = rolesConfig.ranks?.[user.department]?.[user.rank];
        if (expectedRankRole) rolesToAdd.push(expectedRankRole);

        // 3.5 Dodajemy role dowództwa
        if (user.isHC && rolesConfig.hcRole) rolesToAdd.push(rolesConfig.hcRole);
        if (user.isCB && rolesConfig.cbRole) rolesToAdd.push(rolesConfig.cbRole);
        
        if (!user.isHC && rolesConfig.hcRole) rolesToRemove.push(rolesConfig.hcRole);
        if (!user.isCB && rolesConfig.cbRole) rolesToRemove.push(rolesConfig.cbRole);

        // 3.6 Dodajemy role wydziałów i szkoleń
        let userDivs = [];
        let userTrains = [];
        try { userDivs = JSON.parse(user.divisions || '[]'); } catch(e){}
        try { userTrains = JSON.parse(user.trainings || '[]'); } catch(e){}

        if (rolesConfig.divisions) {
          for (const [divName, roleId] of Object.entries(rolesConfig.divisions)) {
            if (!roleId) continue;
            if (userDivs.includes(divName)) rolesToAdd.push(roleId);
            else rolesToRemove.push(roleId);
          }
        }

        if (rolesConfig.trainings) {
          for (const [trainName, roleId] of Object.entries(rolesConfig.trainings)) {
            if (!roleId) continue;
            if (userTrains.includes(trainName)) rolesToAdd.push(roleId);
            else rolesToRemove.push(roleId);
          }
        }

        // 4. Usuwamy nadmiarowe, dodajemy brakujące
        const finalRolesToRemove = rolesToRemove.filter(r => !rolesToAdd.includes(r) && member.roles.cache.has(r));
        const finalRolesToAdd = rolesToAdd.filter(r => !member.roles.cache.has(r));

        if (finalRolesToRemove.length > 0) {
          console.log(`[DEBUG] Zabieram role: ${finalRolesToRemove.join(', ')} dla użytkownika ${member.user.tag}`);
          await member.roles.remove(finalRolesToRemove, 'Zabrano stare role przy synchronizacji FP');
        }
        if (finalRolesToAdd.length > 0) {
          console.log(`[DEBUG] Dodaję role: ${finalRolesToAdd.join(', ')} dla użytkownika ${member.user.tag}`);
          await member.roles.add(finalRolesToAdd, 'Nadano poprawne role przy synchronizacji FP');
        }
      } catch (err) {
        console.error('Błąd podczas parsowania roles.json lub nadawania ról:', err);
      }

    } else {
      console.warn(`Nie znaleziono użytkownika na DC dla nicku: ${user.discordNick}`);
    }
  } catch (error) {
    console.error('Błąd przy synchronizacji nicku na Discordzie:', error);
  }
};

// Funkcja usuwająca role po zwolnieniu funkcjonariusza
const removeDiscordRoles = async (user) => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId || !client.isReady() || !user.discordId) return;
    
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;
    
    const member = await guild.members.fetch(user.discordId).catch(() => null);
    if (!member) return;

    const rolesData = fs.readFileSync('./roles.json', 'utf8');
    const rolesConfig = JSON.parse(rolesData);
    
    const rolesToRemove = [];
    if (rolesConfig.baseRoles) {
      Object.values(rolesConfig.baseRoles).forEach(r => { if (r) rolesToRemove.push(r); });
    }
    if (rolesConfig.ranks) {
      Object.values(rolesConfig.ranks).forEach(deptRanks => {
        Object.values(deptRanks).forEach(r => { if (r) rolesToRemove.push(r); });
      });
    }
    
    if (rolesConfig.hcRole) rolesToRemove.push(rolesConfig.hcRole);
    if (rolesConfig.cbRole) rolesToRemove.push(rolesConfig.cbRole);
    
    if (rolesConfig.divisions) {
      Object.values(rolesConfig.divisions).forEach(r => { if (r) rolesToRemove.push(r); });
    }
    if (rolesConfig.trainings) {
      Object.values(rolesConfig.trainings).forEach(r => { if (r) rolesToRemove.push(r); });
    }

    const finalRolesToRemove = rolesToRemove.filter(r => member.roles.cache.has(r));
    if (finalRolesToRemove.length > 0) {
      await member.roles.remove(finalRolesToRemove, 'Zwolnienie funkcjonariusza');
    }

    if (rolesConfig.citizenRole) {
      try {
        await member.roles.add(rolesConfig.citizenRole, 'Nadano role Obywatel po zwolnieniu');
      } catch (err) {}
    }
    
    // Zresetuj pseudonim
    await member.setNickname('', 'Zwolnienie funkcjonariusza');
    console.log(`Odebrano role DC i zresetowano nick po zwolnieniu dla: ${user.firstName} ${user.lastName}`);
    
  } catch (error) {
    console.error('Błąd przy odbieraniu ról po zwolnieniu:', error);
  }
};

// --- BADGE NUMBER LOGIC ---
function getBadgeRange(department, rank) {
  if (department === 'LSPD') {
    switch (rank) {
      case 'Chief of Police': return [1, 1];
      case 'Assistant Chief': return [2, 2];
      case 'Deputy Chief': return [3, 3];
      case 'Commander': return [4, 6];
      case 'Captain': return [7, 10];
      case 'Lieutenant II': return [11, 29];
      case 'Lieutenant I': return [30, 39];
      case 'Master Sergeant': return [40, 49];
      case 'Staff Sergeant': return [50, 59];
      case 'Sergeant': return [60, 69];
      case 'Officer III+1': return [70, 79];
      case 'Officer III': return [80, 99];
      case 'Officer II': return [100, 129];
      case 'Officer I': return [130, 150];
      case 'Cadet': return [200, 250];
      default: return [500, 999];
    }
  } else if (department === 'BCSO') {
    switch (rank) {
      case 'Sheriff': return [401, 401];
      case 'Undersheriff': return [402, 402];
      case 'Lieutenant II': return [411, 419];
      case 'Lieutenant I': return [420, 429];
      case 'Sergeant III': return [430, 439];
      case 'Sergeant II': return [440, 449];
      case 'Sergeant I': return [450, 459];
      case 'Corporal': return [460, 469];
      case 'Deputy III': return [470, 479];
      case 'Deputy II': return [480, 489];
      case 'Deputy I': return [490, 499];
      default: return [500, 999];
    }
  }
  return [500, 999];
}

async function getNextAvailableBadge(department, rank, divisions = []) {
  if (department === 'BCSO' && rank === 'Sheriff') return '401';
  if (department === 'BCSO' && rank === 'Undersheriff') return '402';

  if (divisions.includes('HC BCSO')) {
    const min = 403, max = 405;
    const users = await prisma.user.findMany({ select: { badgeNumber: true } });
    const takenBadges = users.map(u => parseInt(u.badgeNumber, 10)).filter(n => !isNaN(n));
    for (let i = min; i <= max; i++) {
      if (!takenBadges.includes(i)) return `${i}`;
    }
    throw new Error(`Brak wolnych odznak dla HC BCSO w zakresie ${min}-${max}`);
  }

  const [min, max] = getBadgeRange(department, rank);
  const users = await prisma.user.findMany({ select: { badgeNumber: true } });
  const takenBadges = users.map(u => parseInt(u.badgeNumber, 10)).filter(n => !isNaN(n));
  
  for (let i = min; i <= max; i++) {
    if (!takenBadges.includes(i)) {
      return i < 10 ? `0${i}` : `${i}`;
    }
  }
  throw new Error(`Brak wolnych odznak w zakresie ${min}-${max} dla stopnia ${rank}`);
}

// --- API ROUTES ---

// 1. Pobieranie listy pracowników (Roster)
app.get('/api/officers', async (req, res) => {
  try {
    const officers = await prisma.user.findMany();
    res.json(officers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd serwera przy pobieraniu pracowników' });
  }
});

app.post('/api/officers', async (req, res) => {
  try {
    const data = req.body;
    let newDivs = data.divisions || [];
    if (data.department === 'BCSO' && (data.rank === 'Sheriff' || data.rank === 'Undersheriff')) {
      if (!newDivs.includes('HC BCSO')) newDivs.push('HC BCSO');
    }
    const newBadge = await getNextAvailableBadge(data.department, data.rank, newDivs);
    console.log(`[POST] department: ${data.department}, rank: ${data.rank} -> newBadge: ${newBadge}`);
    
    const newOfficer = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        badgeNumber: newBadge,
        department: data.department,
        rank: data.rank,
        discordNick: data.discordNick,
        isHC: data.isHC || false,
        isCB: data.isCB || false,
        divisions: JSON.stringify(newDivs),
        trainings: JSON.stringify(data.trainings || []),
        status: JSON.stringify(data.statuses || []),
        notes: data.notes || '',
        dtuRank: data.dtuRank || null,
        dtuAlias: data.dtuAlias || null,
        ftdRank: data.ftdRank || null,
        metroRank: data.metroRank || null,
        metroBadge: data.metroBadge || null,
        metroAlias: data.metroAlias || null,
        hwpRank: data.hwpRank || null,
        supervisorId: data.supervisorId || null
      }
    });
    
    // Synchronizuj dane na serwerze Discord (ustawi discordId jeśli brakuje)
    await syncDiscordNickname(newOfficer);
    
    // Pobierz z bazy, by mieć zaktualizowane discordId do pingu
    const syncedOfficer = await prisma.user.findUnique({ where: { id: newOfficer.id } });

    // --- SYSTEM LOG: HIRE ---
    await prisma.systemLog.create({
      data: {
        officerId: syncedOfficer.id,
        actionType: 'HIRE',
        description: `Zatrudniono w ${syncedOfficer.department} na stopniu ${syncedOfficer.rank}`
      }
    });

    if (data.discordAlert) {
      await announceAction(syncedOfficer, 'HIRE');
    }
    
    res.json(syncedOfficer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd serwera przy tworzeniu pracownika' });
  }
});

// 3. Aktualizacja pracownika (Awans itp.)
app.put('/api/officers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    const oldOfficer = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!oldOfficer) return res.status(404).json({ error: 'Nie znaleziono pracownika' });

    let badgeToSave = oldOfficer.badgeNumber;
    let badgeChanged = false;
    let rankAction = null;

    const safeParseJSON = (str) => {
      try { return typeof str === 'string' ? JSON.parse(str) : (Array.isArray(str) ? str : []); } 
      catch(e) { return []; }
    };
    const oldDivs = safeParseJSON(oldOfficer.divisions);
    let newDivs = data.divisions ? (typeof data.divisions === 'string' ? safeParseJSON(data.divisions) : data.divisions) : oldDivs;
    const targetDept = data.department !== undefined ? data.department : oldOfficer.department;
    const targetRankForAuto = data.rank !== undefined ? data.rank : oldOfficer.rank;
    if (targetDept === 'BCSO' && (targetRankForAuto === 'Sheriff' || targetRankForAuto === 'Undersheriff')) {
      if (!newDivs.includes('HC BCSO')) newDivs.push('HC BCSO');
    }
    const oldHcBcso = oldDivs.includes('HC BCSO');
    const newHcBcso = newDivs.includes('HC BCSO');

    // Jeżeli stopień się zmienił, wygeneruj nową odznakę i ogłoś awans/degradację
    if ((data.rank && oldOfficer.rank !== data.rank) || (oldHcBcso !== newHcBcso)) {
      const targetRank = data.rank || oldOfficer.rank;
      badgeToSave = await getNextAvailableBadge(data.department || oldOfficer.department, targetRank, newDivs);
      badgeChanged = true;
      
      const oldRankMin = getBadgeRange(oldOfficer.department, oldOfficer.rank)[0];
      const newRankMin = getBadgeRange(data.department || oldOfficer.department, targetRank)[0];
      
      // Im mniejszy numer, tym wyższy stopień
      if (newRankMin < oldRankMin || (newHcBcso && !oldHcBcso)) {
        rankAction = 'PROMOTION';
      } else {
        rankAction = 'DEMOTION';
      }
      
      console.log(`[PUT] Rank/HC changed to ${targetRank} / HCBcso: ${newHcBcso}. Action: ${rankAction}. New badge: ${badgeToSave}`);
    } else {
      console.log(`[PUT] Rank/HC not changed. Keeping badge: ${badgeToSave}`);
    }

    const updatedOfficer = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        firstName: data.firstName !== undefined ? data.firstName : oldOfficer.firstName,
        lastName: data.lastName !== undefined ? data.lastName : oldOfficer.lastName,
        discordNick: data.discordNick !== undefined ? data.discordNick : oldOfficer.discordNick,
        department: data.department !== undefined ? data.department : oldOfficer.department,
        rank: data.rank !== undefined ? data.rank : oldOfficer.rank,
        isHC: data.isHC !== undefined ? data.isHC : oldOfficer.isHC,
        isCB: data.isCB !== undefined ? data.isCB : oldOfficer.isCB,
        badgeNumber: badgeToSave,
        divisions: JSON.stringify(newDivs),
        trainings: data.trainings ? (typeof data.trainings !== 'string' ? JSON.stringify(data.trainings) : data.trainings) : oldOfficer.trainings,
        status: data.statuses ? (typeof data.statuses !== 'string' ? JSON.stringify(data.statuses) : data.statuses) : oldOfficer.status,
        notes: data.notes !== undefined ? data.notes : oldOfficer.notes,
        dtuRank: data.dtuRank !== undefined ? data.dtuRank : oldOfficer.dtuRank,
        dtuAlias: data.dtuAlias !== undefined ? data.dtuAlias : oldOfficer.dtuAlias,
        ftdRank: data.ftdRank !== undefined ? data.ftdRank : oldOfficer.ftdRank,
        metroRank: data.metroRank !== undefined ? data.metroRank : oldOfficer.metroRank,
        metroBadge: data.metroBadge !== undefined ? data.metroBadge : oldOfficer.metroBadge,
        metroAlias: data.metroAlias !== undefined ? data.metroAlias : oldOfficer.metroAlias,
        hwpRank: data.hwpRank !== undefined ? data.hwpRank : oldOfficer.hwpRank,
        supervisorId: data.supervisorId !== undefined ? data.supervisorId : oldOfficer.supervisorId
      }
    });

    // Zsynchronizuj odznakę/imię/nazwisko na Discordzie po edycji przed announceAction
    await syncDiscordNickname(updatedOfficer);

    const syncedOfficer = await prisma.user.findUnique({ where: { id: updatedOfficer.id } });

    // --- SYSTEM LOG: PROMOTION/DEMOTION ---
    if (badgeChanged && rankAction) {
      await prisma.systemLog.create({
        data: {
          officerId: syncedOfficer.id,
          actionType: rankAction, // 'PROMOTION' lub 'DEMOTION'
          description: rankAction === 'PROMOTION' 
            ? `Awans z ${oldOfficer.rank} na ${data.rank}` 
            : `Degradacja z ${oldOfficer.rank} na ${data.rank}`
        }
      });
    }

    console.log(`[DEBUG] Przed ogłoszeniem awansu: badgeChanged=${badgeChanged}, discordAlert=${data.discordAlert}, rankAction=${rankAction}`);

    if (badgeChanged && data.discordAlert && rankAction) {
      const reason = data.actionReason || 'Brak';
      console.log(`[DEBUG] Wywołuję announceAction z reason=${reason}`);
      await announceAction(syncedOfficer, rankAction, oldOfficer.rank, data.rank, oldOfficer.badgeNumber, badgeToSave, reason);
    } else {
      console.log(`[DEBUG] Warunek nie spełniony. Awans NIE będzie ogłoszony.`);
    }

    res.json(syncedOfficer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd serwera przy aktualizacji pracownika' });
  }
});

// DELETE /api/officers/:id
app.delete('/api/officers/:id', async (req, res) => {
  const { id } = req.params;
  const reason = req.query.reason || 'Brak podanego powodu';
  try {
    const oldOfficer = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (oldOfficer) {
      await announceAction(oldOfficer, 'FIRE', null, null, null, null, reason);
      await removeDiscordRoles(oldOfficer);
    }

    await prisma.user.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd podczas usuwania użytkownika' });
  }
});

// --- DASHBOARD LOGS AGGREGATION ---
app.get('/api/dashboard-logs', async (req, res) => {
  try {
    // Pobierz max 15 wpisów z każdego i posortuj w kodzie
    const points = await prisma.pointRecord.findMany({
      take: 20, orderBy: { date: 'desc' },
      include: { officer: true, issuer: true }
    });
    const duties = await prisma.dutyLog.findMany({
      take: 20, orderBy: { date: 'desc' },
      include: { user: true }
    });
    const system = await prisma.systemLog.findMany({
      take: 20, orderBy: { date: 'desc' },
      include: { officer: true }
    });

    // Ujednolicenie formatu
    const unifiedPoints = points.map(p => ({
      id: `pt_${p.id}`,
      type: 'POINT',
      action: p.type, // 'PLUS' lub 'MINUS'
      officer: p.officer,
      issuer: p.issuer,
      description: p.reason,
      date: p.date
    }));

    const unifiedDuties = duties.map(d => ({
      id: `dt_${d.id}`,
      type: 'DUTY',
      officer: d.user,
      description: `Raport z patrolu (${d.hours}h). ${d.report || ''}`,
      date: d.createdAt
    }));

    const unifiedSystem = system.map(s => ({
      id: `sys_${s.id}`,
      type: 'SYSTEM',
      action: s.actionType, // 'HIRE', 'PROMOTION', 'DEMOTION'
      officer: s.officer,
      description: s.description,
      date: s.date
    }));

    const combined = [...unifiedPoints, ...unifiedDuties, ...unifiedSystem]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 30); // Zwróć tylko 30 najnowszych zdarzeń łącznie

    res.json(combined);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// --- 4. DUTY LOGS API ---
app.delete('/api/duty/clear', async (req, res) => {
  try {
    await prisma.dutyLog.deleteMany();
    res.json({ success: true, message: 'Wszystkie godziny zostały wyzerowane' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd podczas czyszczenia godzin' });
  }
});

app.delete('/api/duty/clear/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await prisma.dutyLog.deleteMany({
      where: { userId: parseInt(userId) }
    });
    res.json({ success: true, message: 'Godziny wybranego pracownika zostały wyzerowane' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd podczas czyszczenia godzin pracownika' });
  }
});

app.get('/api/duty', async (req, res) => {
  try {
    const logs = await prisma.dutyLog.findMany({
      include: { user: true },
      orderBy: { date: 'desc' },
      take: 100
    });
    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd pobierania logów służby' });
  }
});

app.post('/api/duty', async (req, res) => {
  try {
    const { userId, date, hours, report } = req.body;
    const log = await prisma.dutyLog.create({
      data: {
        userId: parseInt(userId),
        date: new Date(date),
        hours: parseFloat(hours),
        report: report || null
      },
      include: { user: true }
    });
    res.json(log);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd dodawania logu służby' });
  }
});

// --- 5. STATS API ---
app.get('/api/stats', async (req, res) => {
  try {
    const lspdCount = await prisma.user.count({ where: { department: 'LSPD' } });
    const bcsoCount = await prisma.user.count({ where: { department: 'BCSO' } });
    const incidentsCount = await prisma.incident.count();
    const warrantsCount = await prisma.warrant.count();
    const dutyLogs = await prisma.dutyLog.findMany();
    const dutyHours = dutyLogs.reduce((sum, log) => sum + log.hours, 0);

    res.json({
      lspdCount,
      bcsoCount,
      incidentsCount,
      warrantsCount,
      dutyHours: dutyHours.toFixed(1)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd pobierania statystyk' });
  }
});

// --- 6. MDT EXTRA API (Feed & BOLO) ---
app.get('/api/feed', async (req, res) => {
  try {
    const recentIncidents = await prisma.incident.findMany({
      take: 10,
      orderBy: { date: 'desc' },
      include: { officer: true }
    });
    const recentDuty = await prisma.dutyLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { user: true }
    });

    const feed = [];
    recentIncidents.forEach(inc => {
      feed.push({
        id: `inc_${inc.id}`,
        timestamp: inc.date, // Używamy prawidłowego pola 'date'
        type: 'INCIDENT',
        message: `Utworzono raport z interwencji #${inc.id} przez ${inc.officer ? inc.officer.badgeNumber : 'System'}`
      });
    });

    recentDuty.forEach(duty => {
      feed.push({
        id: `duty_${duty.id}`,
        timestamp: duty.createdAt,
        type: 'DUTY',
        message: `Funkcjonariusz [${duty.user ? duty.user.badgeNumber : '?'}] zakończył służbę (${duty.hours}h)`
      });
    });

    feed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(feed.slice(0, 15));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd pobierania feedu' });
  }
});

app.get('/api/bolo', async (req, res) => {
  try {
    const wantedCitizens = await prisma.citizen.findMany({
      where: { isWanted: true }
    });
    const stolenVehicles = await prisma.vehicle.findMany({
      where: { isStolen: true }
    });
    res.json({ wantedCitizens, stolenVehicles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd pobierania bolo' });
  }
});

app.delete('/api/duty/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.dutyLog.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd usuwania logu służby' });
  }
});

app.get('/api/points', async (req, res) => {
  try {
    const records = await prisma.pointRecord.findMany({
      include: { officer: true, issuer: true },
      orderBy: { date: 'desc' }
    });
    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd pobierania rekordów punktowych' });
  }
});

app.post('/api/points', async (req, res) => {
  try {
    const { officerId, issuerId, type, reason } = req.body;
    const record = await prisma.pointRecord.create({
      data: {
        officerId: parseInt(officerId),
        issuerId: parseInt(issuerId),
        type,
        reason
      },
      include: { officer: true, issuer: true }
    });
    
    // Wysyłanie powiadomienia na kanał Akta
    const aktaChannelId = process.env.DISCORD_AKTA_CHANNEL_ID;
    if (aktaChannelId) {
      const channel = await client.channels.fetch(aktaChannelId).catch(() => null);
      if (channel) {
        const isPlus = type === 'PLUS';
        const dateStr = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
        
        const embed = new EmbedBuilder()
          .setTitle(isPlus ? '🟢 NOWY WPIS W AKTACH IAD — PLUS' : '❌ NOWY WPIS W AKTACH IAD — MINUS')
          .setColor(isPlus ? 0x2ecc71 : 0xe74c3c)
          .addFields(
            { name: '👤 Funkcjonariusz', value: record.officer.discordId ? `<@${record.officer.discordId}> (${record.officer.firstName} ${record.officer.lastName})` : `${record.officer.firstName} ${record.officer.lastName}`, inline: false },
            { name: '⚖️ Konsekwencja', value: isPlus ? 'PLUS' : 'MINUS', inline: false },
            { name: '📋 Powód', value: reason, inline: false },
            { name: '✍️ Podpisał', value: `${record.issuer.firstName} ${record.issuer.lastName} [${record.issuer.badgeNumber}]`, inline: false },
            { name: '📅 Data', value: dateStr, inline: false }
          )
          .setFooter({ text: 'LSPD IAD — System Akt' })
          .setTimestamp();

        const messageContent = record.officer.discordId ? `<@${record.officer.discordId}>` : null;
        
        await channel.send({ content: messageContent, embeds: [embed] });
      }
    }
    
    res.json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd nadawania punktu' });
  }
});

// ==========================================
// LEAVES (Urlopy) ENDPOINTS (JSON File Based)
// ==========================================
const LEAVES_FILE = path.join(__dirname, 'data', 'leaves.json');

app.get('/api/leaves', (req, res) => {
  try {
    if (!fs.existsSync(LEAVES_FILE)) {
      return res.json([]);
    }
    const data = JSON.parse(fs.readFileSync(LEAVES_FILE, 'utf8'));
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd pobierania urlopów' });
  }
});

app.post('/api/leaves', (req, res) => {
  try {
    const { officerName, badgeNumber, startDate, endDate, reason } = req.body;
    
    // Prosta weryfikacja czy pola istnieją
    if (!officerName || !startDate || !endDate) {
      return res.status(400).json({ error: 'Brak wymaganych danych' });
    }

    let leaves = [];
    if (fs.existsSync(LEAVES_FILE)) {
      leaves = JSON.parse(fs.readFileSync(LEAVES_FILE, 'utf8'));
    }

    const newLeave = {
      id: Date.now().toString(),
      officerName,
      badgeNumber: badgeNumber || '',
      startDate,
      endDate,
      reason: reason || 'Brak podanego powodu',
      createdAt: new Date().toISOString()
    };

    leaves.push(newLeave);
    fs.writeFileSync(LEAVES_FILE, JSON.stringify(leaves, null, 2));

    res.status(201).json(newLeave);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd dodawania urlopu' });
  }
});

// Start serwera
app.listen(PORT, () => {
  console.log(`Serwer API uruchomiony na porcie ${PORT}`);
});
