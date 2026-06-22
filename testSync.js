require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

const prisma = new PrismaClient();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  console.log('Bot logged in as', client.user.tag);
  try {
    const user = await prisma.user.findFirst({ where: { firstName: 'Magda' }, orderBy: { id: 'desc' } });
    if (!user) {
      console.log('User not found');
      process.exit(1);
    }

    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await client.guilds.fetch(guildId);
    let member = await guild.members.fetch(user.discordId).catch(() => null);

    if (!member) {
      console.log('Discord member not found');
      process.exit(1);
    }

    const rolesData = fs.readFileSync('./roles.json', 'utf8');
    const rolesConfig = JSON.parse(rolesData);
    
    const rolesToAdd = [];
    const rolesToRemove = [];

    // Base and rank roles
    if (rolesConfig.baseRoles) Object.values(rolesConfig.baseRoles).forEach(r => { if (r) rolesToRemove.push(r); });
    if (rolesConfig.ranks) Object.values(rolesConfig.ranks).forEach(deptRanks => { Object.values(deptRanks).forEach(r => { if (r) rolesToRemove.push(r); }); });

    const expectedBaseRole = rolesConfig.baseRoles?.[user.department];
    if (expectedBaseRole) rolesToAdd.push(expectedBaseRole);

    const expectedRankRole = rolesConfig.ranks?.[user.department]?.[user.rank];
    if (expectedRankRole) rolesToAdd.push(expectedRankRole);

    if (user.isHC && rolesConfig.hcRole) rolesToAdd.push(rolesConfig.hcRole);
    if (user.isCB && rolesConfig.cbRole) rolesToAdd.push(rolesConfig.cbRole);
    
    if (!user.isHC && rolesConfig.hcRole) rolesToRemove.push(rolesConfig.hcRole);
    if (!user.isCB && rolesConfig.cbRole) rolesToRemove.push(rolesConfig.cbRole);

    let userDivs = [];
    let userTrains = [];
    try { userDivs = JSON.parse(user.divisions || '[]'); } catch(e){}
    try { userTrains = JSON.parse(user.trainings || '[]'); } catch(e){}

    console.log('Parsed user divisions:', userDivs);
    console.log('Parsed user trainings:', userTrains);

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

    console.log('rolesToAdd before filter:', rolesToAdd);
    console.log('rolesToRemove before filter:', rolesToRemove);

    const finalRolesToRemove = rolesToRemove.filter(r => !rolesToAdd.includes(r) && member.roles.cache.has(r));
    const finalRolesToAdd = rolesToAdd.filter(r => !member.roles.cache.has(r));

    console.log('finalRolesToAdd:', finalRolesToAdd);
    console.log('finalRolesToRemove:', finalRolesToRemove);

    if (finalRolesToAdd.length > 0) {
      console.log('Attempting to add roles...');
      await member.roles.add(finalRolesToAdd, 'Test script');
      console.log('Added roles successfully.');
    } else {
      console.log('No roles to add.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error during manual sync:', err);
    process.exit(1);
  }
});

require('dotenv').config();
client.login(process.env.DISCORD_TOKEN);
