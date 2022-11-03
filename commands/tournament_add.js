const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { CharacterData } = require("multiversus.js")
const { currencies } = require('currencies.json')

function buildCharacterChoices() {
  const characterChoices = []
  for (let [name, data] of Object.entries(CharacterData)) {
    characterChoices.push({ name: data.displayName, value: data.id })
  }
  return characterChoices
}

module.exports = {
  name: "tournament_add",
  data: new SlashCommandBuilder()
    .setName("tournament_add")
    .setDescription("Add a tournament that can be searched.")
    .addStringOption(
      opt =>
        opt.setName("name")
          .setDescription("The name of the tournament")
          .setRequired(true)
    )
    .addStringOption(
      opt =>
        opt.setName("type")
          .setDescription("The type of torunament")
          .setRequired(true)
          .addChoices(
            { name: '1v1s', value: '1v1' },
            { name: '2v2s', value: '2v2' },
          )
    )
    .addStringOption(
      opt =>
        opt.setName("start")
          .setDescription("Format: YYYY-MM-DD HH:MM (Use GMT+0)")
          .setRequired(true)
    )
    .addStringOption(
      opt =>
        opt.setName("link")
          .setDescription("Link to the tournament")
          .setRequired(true)
    )
    .addBooleanOption(
      opt =>
        opt.setName("isonline")
          .setDescription("Whether the tournament is online or LAN")
          .setRequired(true)
    )
    .addStringOption(
      opt =>
        opt.setName("prizepool")
          .setDescription("The total prize pool of the tournament")
          .setRequired(true)
    )
    .addStringOption(
      opt =>
        opt.setName("entryfee")
          .setDescription("The entry fee of the tournament")
          .setRequired(true)
    )
    .addStringOption(
      opt =>
        opt.setName("otherfees")
          .setDescription("Any other fees")
          .setRequired(true)
    )
    .addStringOption(
      opt =>
        opt.setName("icon")
          .setDescription("A cool icon to show in the embed (optional)")
          .setRequired(false)
    )
    .addRoleOption(
      opt =>
        opt.setName("adminrole")
          .setDescription("Torunament admins (can edit all settings)")
          .setRequired(false)
    )
    .addStringOption(
      opt =>
        opt.setName("organizer")
          .setDescription("Orgnaizer's discord id (e.g. \"353782817777385472\" default you)")
          .setRequired(false)
    )
    .addStringOption(
      opt =>
        opt.setName("region")
          .setDescription("The region for the tournament")
          .setRequired(false)
    ),
  handler: async (interaction) => {
    if (!interaction.inGuild()) return
    if (!interaction.isChatInputCommand()) return
    // if (interaction.user.id != "353782817777385472") {
    //   interaction.reply("Command not complete.")
    //   return
    // }
    try {
      await interaction.deferReply()
    }
    catch (e) {
      console.error(e)
      return;
    }

    const name = interaction.options.getString('name')
    const type = interaction.options.getString('type')
    const start = interaction.options.getString('start')
    const link = interaction.options.getString('link')
    const isonline = interaction.options.getBoolean('isonline')
    const prizepool = interaction.options.getString('prizepool')
    let entryfee = interaction.options.getString('entryfee').toLowerCase() == "free" ? "0.00" : interaction.options.getString('entryfee')
    let otherfees = interaction.options.getString('otherfees').toLowerCase() == "free" ? "0.00" : interaction.options.getString('otherfees')
    const icon = interaction.options.getString('icon')
    const adminrole = interaction.options.getRole('adminrole') ? interaction.options.getRole('adminrole').id : null
    const organizer = interaction.options.getString('organizer') ? interaction.options.getString('organizer') : interaction.user.id
    const region = interaction.options.getString('region') ? interaction.options.getString('region') : null

    let currency = currencies.find(c => prizepool.startsWith(c.symbol))

    if (!currency) {
      interaction.editReply("Invalid currency.")
      return
    }

    if (entryfee == "0.00") {
      entryfee = currency.symbol + "0.00"
    }

    if (otherfees == "0.00") {
      otherfees = currency.symbol + "0.00"
    }

    let prizePoolParsed = parseFloat(prizepool.substring(currency.symbol.length))
    let entryFeeParsed = parseFloat(entryfee.substring(currency.symbol.length))
    let otherFeesParsed = parseFloat(otherfees.substring(currency.symbol.length))

    if (isNaN(prizePoolParsed) || isNaN(entryFeeParsed) || isNaN(otherFeesParsed)) {
      interaction.editReply("Invalid prize pool, entry fee, or other fees.")
      return
    }

    // verify start date with regex
    const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
    if (!regex.test(start)) {
      await interaction.editReply({ content: "Invalid start date format. Please use YYYY-MM-DD HH:MM (Use GMT+0)" })
      return
    }

    const startDate = new Date(`${start.split(" ")[0]}T${start.split(" ")[1]}:00.000Z`)

    if (startDate < new Date()) {
      await interaction.editReply({ content: "Start date must be in the future." })
      return
    }

    if (await interaction.client.db.collection('tournaments').findOne({ name: name, startDate: { $gte: new Date() } })) {
      await interaction.editReply({ content: "A tournament with that name which hasn't yet happened already exists." })
      return
    }

    if (!await interaction.client.db.collection("verifiedOrganizers").findOne({ _id: interaction.user.id })) {
      let channel = await interaction.client.channels.fetch("1013335975038034040")
      let embed = new EmbedBuilder()
        .setTitle("Tournament Review")
        .setDescription(`**Name:** ${name}\n**Type:** ${type}\n**Start:** ${start}\n**Link:** ${link}\n**Is Online:** ${isonline}\n**Prize Pool:** ${prizepool}\n**Entry Fee:** ${entryfee}\n**Other Fees:** ${otherfees}\n**Icon:** ${icon}\n**Organizer:** ${organizer}\n**Region:** ${region}\n**Admin Role:** ${adminrole}`)

      await channel.send({ embeds: [embed] })
      await interaction.editReply({ content: "Your tournament has been sent for review. Skip the review process for your future tournaments by sending me a message on twitter <https://twitter.com/Digital_Steven1>." })
    }
    else {
      await interaction.client.db.collection('tournaments').insertOne(
        {
          name: name,
          type: type,
          link: link,
          isOnline: isonline,
          prizePool: prizePoolParsed,
          entryFee: entryFeeParsed,
          otherFees: otherFeesParsed,
          icon: icon,
          adminRole: adminrole,
          startDate: startDate,
          organizer: organizer,
          currency: currency.symbol,
          region: region
        }
      )
      await interaction.editReply({ content: "Your tournament has been added." })
    }
  }
}