import SwiftUI

/// الشاشة الأولى: هل البوت حيّ، وماذا يجري عليه الآن.
struct HomeView: View {
    @Environment(Hub.self) private var hub

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Metric.spaceSm) {
                TopBar("مِقود", trailing: hub.status?.bot.tag)

                if let status = hub.status {
                    identity(status.bot)
                    counters(status)
                    running(status.live)
                    system(status)
                } else {
                    Card {
                        HStack(spacing: 10) {
                            ProgressView().tint(Ink.red)
                            Text("أقرأ الحالة…")
                                .font(.bodyArBold(Type.body))
                                .foregroundStyle(Ink.ink)
                        }
                    }
                }

                if let trouble = hub.trouble {
                    Text(trouble)
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.redDeep)
                }
            }
            .padding(Metric.spaceSm)
        }
        .background(Ink.paper)
        .refreshable { await hub.refresh() }
        .task { await hub.refresh() }
    }

    // ————————————————————— هوية البوت —————————————————————

    private func identity(_ bot: BotFacts) -> some View {
        Card {
            HStack(spacing: 12) {
                AsyncImage(url: bot.avatar.flatMap(URL.init(string:))) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Ink.paperTint
                }
                .frame(width: 54, height: 54)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(Ink.ink, lineWidth: 3)
                )

                VStack(alignment: .leading, spacing: 4) {
                    Text((bot.tag ?? "غير متصل").bidiIsolated)
                        .font(.bodyArBold(Type.body))
                        .foregroundStyle(Ink.ink)
                    HStack(spacing: 6) {
                        Circle()
                            .fill(bot.online ? Ink.red : Ink.ink.opacity(0.25))
                            .frame(width: 10, height: 10)
                        Text(bot.online ? liveFor(bot.upSeconds) : "مطفأ")
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink.opacity(0.7))
                    }
                }

                Spacer(minLength: 8)
                if let ping = bot.pingMs { Pill("\(ping)ms") }
            }
        }
    }

    private func liveFor(_ seconds: Int?) -> String {
        guard let seconds else { return "متصل" }
        return "شغّال منذ \(spell(seconds))"
    }

    // ————————————————————— العدّادات —————————————————————

    private func counters(_ status: Status) -> some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
            spacing: 12
        ) {
            counter("السيرفرات", "\(status.bot.guilds)", Ink.yellow, Ink.redDeep)
            counter("الأعضاء", "\(status.bot.members)", Ink.cream, Ink.ink)
            counter("الألعاب", "\(status.games.count)", Ink.cream, Ink.ink)
            counter("جارية الآن", "\(status.games.running)", Ink.red, Ink.ink)
        }
    }

    private func counter(_ label: String, _ value: String, _ fill: Color, _ shadow: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.display(34))
                .foregroundStyle(fill == Ink.red ? Ink.cream : Ink.ink)
            Text(label)
                .font(.bodyAr(Type.meta))
                .foregroundStyle((fill == Ink.red ? Ink.cream : Ink.ink).opacity(0.75))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(fill))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(shadow, lift: 6, radius: 18)
    }

    // ————————————————————— الجارية —————————————————————

    @ViewBuilder
    private func running(_ live: [LiveSession]) -> some View {
        Text("الجارية الآن")
            .font(.displaySoft(Type.title))
            .foregroundStyle(Ink.ink)
            .padding(.top, 6)

        if live.isEmpty {
            Card {
                Text("ما فيه لعبة شغّالة.")
                    .font(.bodyAr(Type.body))
                    .foregroundStyle(Ink.ink.opacity(0.7))
            }
        } else {
            ForEach(live) { session in
                Card(shadow: Ink.redDeep) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(session.game)
                                .font(.bodyArBold(Type.body))
                                .foregroundStyle(Ink.ink)
                            Text((session.guildName ?? session.guildId).bidiIsolated)
                                .font(.bodyAr(Type.meta))
                                .foregroundStyle(Ink.ink.opacity(0.65))
                        }
                        Spacer(minLength: 8)
                        Pill(since(session.startedAt))
                    }
                }
            }
        }
    }

    private func since(_ startedAt: Double) -> String {
        let seconds = max(0, Int(Date().timeIntervalSince1970 - startedAt / 1000))
        return spell(seconds)
    }

    // ————————————————————— النظام —————————————————————

    @ViewBuilder
    private func system(_ status: Status) -> some View {
        Text("النظام")
            .font(.displaySoft(Type.title))
            .foregroundStyle(Ink.ink)
            .padding(.top, 6)

        Card {
            VStack(spacing: 0) {
                row("قاعدة البيانات", status.db.ok ? "سليمة · \(status.db.ms ?? 0)ms" : (status.db.error ?? "متعثّرة"), bad: !status.db.ok)
                line
                row("الذاكرة", "\(status.host.rssMb) ميغابايت")
                line
                row("العمليّة شغّالة منذ", spell(status.host.upSeconds))
                line
                row("Node", status.host.node)
            }
        }
    }

    private var line: some View {
        Rectangle().fill(Ink.ink.opacity(0.12)).frame(height: 1).padding(.vertical, 8)
    }

    private func row(_ label: String, _ value: String, bad: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.bodyAr(Type.label))
                .foregroundStyle(Ink.ink.opacity(0.7))
            Spacer(minLength: 12)
            Text(value.bidiIsolated)
                .font(.bodyArBold(Type.label))
                .foregroundStyle(bad ? Ink.redDeep : Ink.ink)
                .multilineTextAlignment(.trailing)
        }
    }
}

/// مدّة بالعربية بلا أرقام عشرية — «ساعتين» لا «2.4 ساعة».
func spell(_ seconds: Int) -> String {
    if seconds < 60 { return "\(seconds) ثانية" }
    let minutes = seconds / 60
    if minutes < 60 { return "\(minutes) دقيقة" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours) ساعة" }
    return "\(hours / 24) يوم"
}
