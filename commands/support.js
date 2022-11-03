const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  name: "supportdevelopment",
  data: new SlashCommandBuilder()
    .setName("supportdevelopment")
    .setDescription("Get info on how to support the development of this bot."),
  handler: async (interaction) => {
    if (!interaction.inGuild()) return
    if (!interaction.isChatInputCommand()) return

    let embed = new EmbedBuilder()
      .setTitle("Support Development")
      .setDescription("Thanks for considering supporting the development of this bot. There are a two main ways you can do this:")
      .addFields(
          {name: "Share", value: "The easiest way to support development of the bot it to just share it to other people and servers. The link to invite the bot is: https://discord.com/oauth2/authorize?client_id=1003322776742006854&scope=bot&permissions=2048", inline: false},
          {name: "Donate", value: "If you want to donate to support development, you can donate directly to me [using ko-fi](https://ko-fi.com/stevenwebster). Ko-fi allows you to pick one time payments or recurring if you are into that.", inline: false},
        )


    interaction.reply({ embeds: [embed], ephemeral: true })
  }
}