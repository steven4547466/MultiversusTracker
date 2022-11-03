const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { CharacterData } = require("multiversus.js")

function buildCharacterChoices() {
  const characterChoices = []
  for (let [name, data] of Object.entries(CharacterData)) {
    characterChoices.push({ name: data.displayName, value: data.id })
  }
  return characterChoices
}

const cache = {}

async function getList(interaction, filter, sortObj) {
  let skip = 0
  if (interaction.message) {
    if (!cache[interaction.message.id]) {
      await interaction.editReply({ content: "This page has expired." })
      return
    }
    clearTimeout(cache[interaction.message.id].timeout)
    cache[interaction.message.id].timeout = setTimeout(() => { delete cache[interaction.message.id] }, 180000)
    cache[interaction.message.id].page += filter
    skip = cache[interaction.message.id].page * 3
    filter = cache[interaction.message.id].filter
    sortObj = cache[interaction.message.id].sortObj
  }

  let count = await interaction.client.db.collection("tournaments").count(filter)
  let tournaments = await interaction.client.db.collection("tournaments").find(filter).skip(skip).limit(3)

  if (sortObj) {
    tournaments = await tournaments.sort(sortObj)
  }
  else {
    tournaments = await tournaments.sort({ startDate: 1 })
  }

  tournaments = await tournaments.toArray()

  if (tournaments.length == 0) {
    await interaction.editReply({ content: "No tournaments found in specification." })
    return
  }

  let embeds = []

  /*
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
        organizer: interaction.user.id,
        currency: currency.symbol
      }
  */

  let links = []

  for (let tournament of tournaments) {
    let organizer = null
    try {
      organizer = await interaction.client.users.fetch(tournament.organizer)
    }
    catch (e) { }
    links.push(tournament.link)
    if (!organizer) organizer = tournament.organizer
    let embed = new EmbedBuilder()
      .setTitle(tournament.name)
      .setURL(tournament.link + `?v=${links.lastIndexOf(tournament.link)}`)
      .addFields(
        { name: "Online?", value: tournament.isOnline ? "Yes" : "No", inline: true },
        { name: "Region", value: tournament.region ? tournament.region : "None given", inline: true },
        { name: "Type", value: tournament.type, inline: true },
        { name: "Start Date", value: `<t:${tournament.startDate.getTime() / 1000}:f>`, inline: true },
        { name: "Prize Pool", value: `${tournament.currency}${tournament.prizePool}`, inline: true },
        { name: "Entry Fee", value: `${tournament.currency}${tournament.entryFee}`, inline: true },
        { name: "Other Fees", value: `${tournament.currency}${tournament.otherFees}`, inline: true },
      )
      .setFooter({ text: tournament.link })

    if (tournament.icon) {
      embed.setThumbnail(tournament.icon)
    }


    if (organizer && organizer.tag)
      embed.setAuthor({ name: organizer.tag, iconURL: organizer.avatarURL() })
    else
      embed.setAuthor({ name: organizer })

    embeds.push(embed)
  }

  // console.log(embeds.length)
  // console.log(embeds[1])

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('prevPageTourney')
        .setLabel('Previous Page')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(Math.round(skip / 3) == 0),
      new ButtonBuilder()
        .setCustomId('nextPageTourney')
        .setLabel('Next Page')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(count <= skip + 3),
    );


  let msg = await interaction.editReply({ embeds, components: [row] })

  if (!cache[msg.id])
    cache[msg.id] = { page: 0, filter, sortObj, timeout: setTimeout(() => { delete cache[msg.id] }, 180000) }
}

module.exports = {
  getList,
  name: "tournament_list",
  data: new SlashCommandBuilder()
    .setName("tournament_list")
    .setDescription("List upcoming tournaments.")
    .addStringOption(
      opt =>
        opt.setName("sort")
          .setRequired(false)
          .setDescription("Sort by")
          .addChoices(
            { name: 'Name', value: 'name' },
            { name: 'Start Date', value: 'startDate' },
            { name: 'Prize Pool', value: 'prizePool' },
            { name: 'Entry Fee', value: 'entryFee' },
          )
    )
    .addStringOption(
      opt =>
        opt.setName("sortdirection")
          .setRequired(false)
          .setDescription("Sort direction")
          .addChoices(
            { name: 'Ascending', value: 'asc' },
            { name: 'Descending', value: 'desc' },
          )
    )
    .addStringOption(
      opt =>
        opt.setName("type")
          .setRequired(false)
          .setDescription("Tournament type filter")
          .addChoices(
            { name: '1v1s', value: '1v1' },
            { name: '2v2s', value: '2v2' },
          )
    )
    .addIntegerOption(
      opt =>
        opt.setName("prizepool")
          .setRequired(false)
          .setDescription("Prize pool filter (greater than or equal to)")
    )
    .addStringOption(
      opt =>
        opt.setName("startdate")
          .setRequired(false)
          .setDescription("Format: YYYY-MM-DD HH:MM (Use GMT+0) (greater than or equal to)")
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

    let sort = interaction.options.getString("sort")
    let sortDirection = interaction.options.getString("sortdirection")
    let type = interaction.options.getString("type")
    let prizePool = interaction.options.getInteger("prizepool")
    let startDate = interaction.options.getString("startdate")
    let startDateParsed = new Date()

    if (sortDirection == "desc") {
      sortDirection = -1
    }
    else if (sortDirection == "asc") {
      sortDirection = 1
    }
    else {
      if (sort == "name") {
        sortDirection = 1
      }
      else if (sort == "startDate") {
        sortDirection = 1
      }
      else if (sort == "prizePool") {
        sortDirection = -1
      }
      else if (sort == "entryFee") {
        sortDirection = 1
      }
    }

    if (startDate) {
      // verify start date with regex
      const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
      if (!regex.test(startDate)) {
        await interaction.editReply({ content: "Invalid start date format. Please use YYYY-MM-DD HH:MM (Use GMT+0)" })
        return
      }

      startDateParsed = new Date(`${startDate.split(" ")[0]}T${startDate.split(" ")[1]}:00.000Z`)

      if (startDateParsed < new Date()) {
        await interaction.editReply({ content: "Start date must be in the future." })
        return
      }
    }

    let filter = { startDate: { $gte: startDateParsed } }

    if (type) {
      filter.type = type
    }

    if (prizePool) {
      filter.prizePool = { $gte: prizePool }
    }

    let sortObj = null
    if (sort) {
      sortObj = {}
      sortObj[sort] = sortDirection
    }

    getList(interaction, filter, sortObj)
  }
}