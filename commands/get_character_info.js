const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { CharacterData, PerkData } = require("multiversus.js")

function buildCharacterChoices() {
  const characterChoices = []
  for (let [name, data] of Object.entries(CharacterData)) {
    characterChoices.push({ name: data.displayName, value: data.id })
  }
  return characterChoices
}

module.exports = {
  name: "getcharacterinfo",
  data: new SlashCommandBuilder()
    .setName("getcharacterinfo")
    .setDescription("Get the character info for a user.")
    .addStringOption(
      opt =>
        opt.setName("character")
          .setDescription("The character to check (if not added, gets overall rank)")
          .setRequired(true)
          .addChoices(...(buildCharacterChoices()))
    )
    .addStringOption(
      opt =>
        opt.setName("user")
          .setDescription("The username of the player")
          .setRequired(false)
    )
    .addStringOption(
      opt =>
        opt.setName("platform")
          .setDescription("The platform to search on (if not added, defaults to WB Games)")
          .setRequired(false)
          .addChoices(
            { name: "WB Games", value: "wb_network" },
            { name: "Twitch", value: "twitch" },
            { name: "Play Station", value: "ps4" },
            { name: "Discord", value: "discord" },
            { name: "Google", value: "google" },
            { name: "Steam", value: "steam" },
            { name: "Epic Games", value: "epic" },
            { name: "Xbox", value: "xb1" }
          )
    ),
  handler: async (interaction) => {
    if (!interaction.inGuild()) return
    if (!interaction.isChatInputCommand()) return
    let name = interaction.options.getString("user")
    let type = interaction.options.getString("type")
    let character = interaction.options.getString("character")
    let platform = interaction.options.getString("platform")
    if (!platform) platform = "wb_network"

    try {
      await interaction.deferReply()
    }
    catch (e) {
      console.error(e)
      return;
    }

    try {
      let user
      try {
        if (name) {
          let search = (await interaction.client.MultiversusClient.searchExactUsername(name, 100, null, platform))
          if (search) {
            user = (await interaction.client.MultiversusClient.getAccount(search.account_id))
          }
        }
        else {
          let wbId = await interaction.client.utils.getLinkedAccount(interaction.user)
          if (!wbId) return interaction.editReply("You must have a linked account to use commands without search queries.")
          user = (await interaction.client.MultiversusClient.getAccount(wbId))
          name = interaction.user.username
        }
        // else {
        //   let cursor = null
        //   while (!user) {
        //     let results = (await interaction.client.MultiversusClient.searchByUsername(interaction.user.username, 100, cursor, "discord"))
        //     let users = results.results
        //     let temp = users.find(u => u.result.account.identity.alternate.discord[0].id == interaction.user.id)
        //     if (temp) {
        //       user = temp.result
        //       name = temp.result.account.identity.alternate.wb_network[0].username
        //       break;
        //     }
        //     else if (results.cursor == null) {
        //       interaction.editReply("Couldn't find a user linked to your discord account. Either link your WB Games account, or supply a username to search for.")
        //       return;
        //     }
        //     cursor = results.cursor
        //   }
        // }
      }
      catch (e) {
        if (e.code == 401) {
          return interaction.editReply("Key refreshed. Please try again.")
        }
        else if (e.code == 503) {
          return interaction.editReply("Maintenance mode is activated. Please try again later.")
        }
        else {
          return interaction.editReply("An unknown error has occured.")
        }
      }

      if (!user) {
        interaction.editReply("User not found.")
        return
      }

      let profile = await interaction.client.MultiversusClient.getProfile(user.id)
      let account = user//await interaction.client.MultiversusClient.getAccount(user.id)

      let characterData = account.server_data.Characters[character] ? account.server_data.Characters[character].Mastery : { Level: 0, CurrentXP: 0 }
      let perks = profile.data.PerkPreferences.Characters[character] ? profile.data.PerkPreferences.Characters[character].PerkPages[profile.data.PerkPreferences.Characters[character].LastSelectedPage] : { PerkSlugs: [] }

      let embed = new EmbedBuilder()
        .setTitle(`${name}'s ${Object.entries(CharacterData).find((entry) => entry[1].id == character)[1].displayName} Info`)
        .setColor("#00ff00")
        .addFields(
          { name: "Level", value: `${characterData.Level}` },
          { name: "Current XP", value: `${Math.round(characterData.CurrentXP)}` },
          { name: "Wins", value: `${profile.server_data.stat_trackers.character_wins[character] || 0}` },
          {
            name: "Perks", value: `${perks.PerkSlugs.length == 0 ? "No data" : perks.PerkSlugs.map((p, i) => {
              if (p.trim() == "") return `${i == 0 ? "**Signature:** " : `Slot #${i}: `}Empty`
              let perk = Object.entries(PerkData).find((entry) => entry[1].slugs.includes(p))[1]
              return `${perk.characterSpecific ? "**Signature:** " : `Slot #${i}: `}${perk.displayName}`
            }).join("\n")}`
          },
        )
        .setThumbnail(`https://oliy.is-just-a.dev/mvs_characters/${character}.png`)
        .setFooter({ text: "Created by Steven4547466#1407", iconURL: interaction.client.user.displayAvatarURL() });

      interaction.editReply({ embeds: [embed] })
    }
    catch (e) {
      if (e.code == 401) {
        return interaction.editReply("Key refreshed. Please try again.")
      }
    }
  }
}