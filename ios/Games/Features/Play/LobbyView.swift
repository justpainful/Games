import SwiftUI

/// لوبي اللعب في السيرفر.
///
/// جلسة السيرفر تحتاج قناة حيّة (WebSocket) لم تُفتح بعد في هذا الإصدار. الشاشة
/// تقول ذلك صراحة بدل أن تعرض دوّارة تنتظر إلى الأبد: انتظار بلا تفسير يُقرأ
/// عطلًا، والحالة المفهومة أفضل من شاشة فارغة أو تعطّل.
struct LobbyView: View {
    let game: GameInfo
    @Environment(AppState.self) private var app

    var body: some View {
        GameScreen(title: game.title, trailing: "في السيرفر") {
            statusCard
            guildCard
            playersCard

            if game.soloable {
                NavigationLink(value: PlayRoute.solo(game.id)) {
                    HStack(spacing: 10) {
                        Image(systemName: "cpu.fill")
                            .font(.system(size: 17, weight: .bold))
                        Text("العب ضد \(Bots.displayName) الآن")
                            .font(.bodyArBold(Type.body))
                            .lineLimit(1)
                            .minimumScaleFactor(0.65)
                    }
                    .foregroundStyle(Ink.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .padding(.horizontal, 16)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Ink.yellow))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(Ink.ink, lineWidth: 3)
                    )
                    .hardShadow(Ink.redDeep, lift: 5, radius: 16)
                }
                .buttonStyle(.plain)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    // ————— أجزاء —————

    private var statusCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "hourglass")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Ink.red)
                    Text("قيد التجهيز")
                        .font(.displaySoft(Type.body))
                        .foregroundStyle(Ink.ink)
                    Spacer(minLength: 8)
                    Pill("قريبًا")
                }
                Text("اللعب المباشر داخل السيرفر من التطبيق لم يُفتح بعد. حتى ذلك الحين ابدأ «\(game.title)» من قناة السيرفر عبر البوت، وستظهر الجلسة هنا فور جاهزيتها.")
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var guildCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                SmallHeading("السيرفر")
                if let guild = activeGuild {
                    HStack(spacing: 12) {
                        avatar(url: guild.iconURL(), fallback: "person.3.fill")
                        Text(guild.name.bidiIsolated)
                            .font(.bodyArBold(Type.label))
                            .foregroundStyle(Ink.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Spacer(minLength: 0)
                    }
                } else {
                    Text("لم نجد سيرفرًا مشتركًا بينك وبين البوت. أضف البوت إلى سيرفرك ثم أعد المحاولة.")
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink)
                        .lineSpacing(Type.lineSpacing)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var playersCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    SmallHeading("اللاعبون")
                    Spacer(minLength: 8)
                    Pill(playersRange)
                }

                if let account = app.account {
                    HStack(spacing: 12) {
                        avatar(url: account.avatarURL(size: 128), fallback: "person.crop.circle.fill")
                        // كل اسم من المستخدم يُعزل: ".zja6" بلا عزل تُعرض "zja6."
                        Text(account.shownName.bidiIsolated)
                            .font(.bodyArBold(Type.label))
                            .foregroundStyle(Ink.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Spacer(minLength: 0)
                        Pill("القائد")
                    }
                }

                HStack(spacing: 12) {
                    ZStack {
                        Circle().fill(Ink.paperTint)
                        Circle().strokeBorder(Ink.ink, lineWidth: 3)
                        Image(systemName: "ellipsis")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(Ink.ink)
                    }
                    .frame(width: 40, height: 40)
                    Text("في انتظار انضمام بقية اللاعبين")
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private var activeGuild: Guild? {
        guard let id = app.activeGuildID else { return app.guilds.first }
        return app.guilds.first { $0.id == id } ?? app.guilds.first
    }

    /// المدى معزول اتجاهيًا وإلا عُرض «25–1» بدل «1–25».
    private var playersRange: String {
        if game.minPlayers == game.maxPlayers {
            return "\(game.minPlayers) لاعبين"
        }
        return "\("\(game.minPlayers)–\(game.maxPlayers)".bidiIsolated) لاعبًا"
    }

    private func avatar(url: URL?, fallback: String) -> some View {
        ZStack {
            Circle().fill(Ink.cream)
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Image(systemName: fallback)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Ink.ink)
            }
            .clipShape(Circle())
            Circle().strokeBorder(Ink.ink, lineWidth: 3)
        }
        .frame(width: 40, height: 40)
    }
}

/// عنوان صغير داخل بطاقة.
struct SmallHeading: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        (Text("«").foregroundStyle(Ink.red)
         + Text(text).foregroundStyle(Ink.ink)
         + Text("»").foregroundStyle(Ink.red))
            .font(.displaySoft(Type.body))
    }
}
