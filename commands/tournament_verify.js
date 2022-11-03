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
  name: "tournament_verify",
  data: new SlashCommandBuilder()
    .setName("tournament_verify")
    .setDescription("Verify a tournament (DEV ONLY)")
    .addStringOption(
      opt =>
        opt.setName("id")
          .setRequired(true)
          .setDescription("The ID of the tournament message")
    )
    .addBooleanOption(
      opt =>
        opt.setName("user")
          .setRequired(false)
          .setDescription("Verify organizer?")
    ),
  handler: async (interaction) => {
    if (!interaction.inGuild()) return
    if (!interaction.isChatInputCommand()) return
    if (interaction.user.id != "353782817777385472") {
      interaction.reply("You do not have permission to use this command.")
      return
    }

    try {
      await interaction.deferReply()
    }
    catch (e) {
      console.error(e)
      return;
    }

    let channel = await interaction.client.channels.fetch("1013335975038034040")
    let id = interaction.options.getString("id")
    let verifyOrganizer = interaction.options.getBoolean("user")
    if (verifyOrganizer) {
      if (await interaction.client.db.collection("verifiedOrganizers").findOne({ _id: id }))
        interaction.editReply({ content: "Organizer already verified.", ephemeral: true })
      else {
        await interaction.client.db.collection("verifiedOrganizers").insertOne({ _id: id })
        interaction.editReply({ content: "Organizer verified.", ephemeral: true })
      }
      return
    }
    let message = await channel.messages.fetch(id)
    if (!message) {
      interaction.editReply("Message not found.")
      return
    }
    let embed = message.embeds[0]
    let [name, type, startDate, link, isOnline, prizePool, entryFee, otherFees, icon, organizer, region, adminRole] = embed.description.split("\n")
    name = name.split("** ").slice(1).join("** ")
    type = type.split("** ").slice(1).join("** ")
    startDate = startDate.split("** ").slice(1).join("** ")
    link = link.split("** ").slice(1).join("** ")
    isOnline = isOnline.split("** ").slice(1).join("** ")
    prizePool = prizePool.split("** ").slice(1).join("** ")
    entryFee = entryFee.split("** ").slice(1).join("** ")
    otherFees = otherFees.split("** ").slice(1).join("** ")
    icon = icon.split("** ").slice(1).join("** ") == "null" ? null : icon.split("** ").slice(1).join("** ")
    organizer = organizer.split("** ").slice(1).join("** ") == "null" ? null : organizer.split("** ").slice(1).join("** ")
    region = region.split("** ").slice(1).join("** ") == "null" ? null : region.split("** ").slice(1).join("** ")
    adminRole = adminRole.split("** ").slice(1).join("** ") == "null" ? null : adminRole.split("** ").slice(1).join("** ")

    let currency = currencies.find(c => prizePool.startsWith(c.symbol))

    if (!currency) {
      interaction.editReply("Invalid currency.")
      return
    }

    let prizePoolParsed = parseFloat(prizePool.substring(currency.symbol.length))
    let entryFeeParsed = parseFloat(entryFee.substring(currency.symbol.length))
    let otherFeesParsed = parseFloat(otherFees.substring(currency.symbol.length))

    if (isNaN(prizePoolParsed) || isNaN(entryFeeParsed) || isNaN(otherFeesParsed)) {
      interaction.editReply("Invalid prize pool, entry fee, or other fees.")
      return
    }

    const startDateParsed = new Date(`${startDate.split(" ")[0]}T${startDate.split(" ")[1]}:00.000Z`)

    if (startDateParsed < new Date()) {
      await interaction.editReply({ content: "Start date must be in the future." })
      return
    }

    if (await interaction.client.db.collection('tournaments').findOne({ name: name, startDate: { $gte: new Date() } })) {
      await interaction.editReply({ content: "A tournament with that name which hasn't yet happened already exists." })
      return
    }

    console.log(name, type, startDateParsed, link, isOnline, prizePoolParsed, entryFeeParsed, otherFeesParsed, icon, organizer, adminRole)

    await interaction.client.db.collection('tournaments').insertOne(
      {
        name: name,
        type: type,
        link: link,
        isOnline: isOnline,
        prizePool: prizePoolParsed,
        entryFee: entryFeeParsed,
        otherFees: otherFeesParsed,
        icon: icon,
        adminRole: adminRole,
        startDate: startDateParsed,
        organizer: organizer,
        currency: currency.symbol,
        region: region,
      }
    )

    await interaction.editReply({ content: "Added." })
  }
}