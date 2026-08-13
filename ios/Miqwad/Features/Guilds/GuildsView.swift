import SwiftUI

/// اختيار السيرفر، ثم إعداداته.
struct GuildsView: View {
    @Environment(Hub.self) private var hub

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Metric.spaceSm) {
                    TopBar("السيرفرات", trailing: hub.guilds.isEmpty ? nil : "\(hub.guilds.count)")

                    if hub.guilds.isEmpty {
                        Card {
                            Text("ما فيه سيرفر. إمّا البوت غير متصل، وإمّا ما دخل أي سيرفر بعد.")
                                .font(.bodyAr(Type.body))
                                .foregroundStyle(Ink.ink.opacity(0.7))
                        }
                    }

                    ForEach(hub.guilds) { guild in
                        NavigationLink {
                            GuildDetailView(guildId: guild.id, name: guild.name)
                        } label: {
                            row(guild)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(Metric.spaceSm)
            }
            .background(Ink.paper)
            .refreshable { await hub.loadGuilds() }
        }
        .task { await hub.loadGuilds() }
    }

    private func row(_ guild: GuildBrief) -> some View {
        Card {
            HStack(spacing: 12) {
                AsyncImage(url: guild.icon.flatMap(URL.init(string:))) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Ink.paperTint
                }
                .frame(width: 46, height: 46)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(Ink.ink, lineWidth: 3)
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(guild.name.bidiIsolated)
                        .font(.bodyArBold(Type.body))
                        .foregroundStyle(Ink.ink)
                    Text("\(guild.members) عضو")
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink.opacity(0.65))
                }

                Spacer(minLength: 8)
                Image(systemName: "chevron.left")
                    .foregroundStyle(Ink.ink.opacity(0.5))
            }
        }
    }
}
