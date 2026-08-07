import SwiftUI

// ————— أدوات مشتركة لشاشات اللعب الأونلاين —————
//
// كل نص في هذه الشاشات مصدره الخادم أو لاعب آخر، فقاعدة العزل الاتجاهي تُطبَّق
// عليه بلا استثناء: اسم ".zja6" بلا عزل يُعرض "zja6." داخل الجملة العربية.

/// أرقام لاتينية موحّدة في كل الواجهة (DESIGN.md §4).
private let latinDigits = Locale(identifier: "en_US_POSIX")

func onlineNumber(_ value: Int) -> String {
    value.formatted(.number.locale(latinDigits))
}

/// تنظيف النص المرافق للمشهد.
///
/// النص نفسه يُرسل إلى ديسكورد أيضًا، فيحمل ترميزه: `<@1234>` للإشارة،
/// `<t:…:R>` للوقت النسبي، و`**` للعريض. عرضه خامًا في التطبيق يُظهر رموزًا
/// لا معنى لها للاعب، فيُجرَّد هنا بدل أن يُطلب من الخادم نصّان.
enum SceneCopy {
    static func plain(_ raw: String) -> String {
        var text = raw
        text = text.replacingOccurrences(of: "<@[!&]?[0-9]+>", with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: "<t:[0-9]+:[A-Za-z]>", with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: "<#[0-9]+>", with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: "**", with: "")
        text = text.replacingOccurrences(of: "__", with: "")
        text = text.replacingOccurrences(of: "  ", with: " ")
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// أفتار دائري بحدّ أسود — والحلقة الصفراء للقائد وحده (DESIGN.md §5).
struct OnlineAvatar: View {
    let player: ScenePlayer
    var size: CGFloat = 40
    var ringed: Bool = false

    private var initial: String {
        let trimmed = player.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "؟" : String(trimmed.prefix(1))
    }

    var body: some View {
        Group {
            if let url = player.avatarURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .empty:
                        ProgressView().controlSize(.small).tint(Ink.ink)
                    case .failure:
                        letter
                    @unknown default:
                        letter
                    }
                }
            } else {
                letter
            }
        }
        .frame(width: size, height: size)
        .background(Circle().fill(Ink.cream))
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Ink.ink, lineWidth: 3))
        .padding(ringed ? 3 : 0)
        .overlay {
            if ringed { Circle().strokeBorder(Ink.yellow, lineWidth: 3) }
        }
        .accessibilityHidden(true)
    }

    private var letter: some View {
        Text(initial.bidiIsolated)
            .font(.displaySoft(size * 0.4))
            .foregroundStyle(Ink.ink)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Ink.yellow)
    }
}

/// صف لاعب: أفتار واسم وشارات.
struct OnlinePlayerRow: View {
    let player: ScenePlayer
    var isHost: Bool = false
    var isMe: Bool = false
    var trailing: String? = nil
    var dimmed: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            OnlineAvatar(player: player, ringed: isHost)
            Text(player.name.bidiIsolated)
                .font(.bodyArBold(Type.label))
                .foregroundStyle(Ink.ink)
                .lineLimit(1)
                .truncationMode(.tail)
                .minimumScaleFactor(0.6)
            if isMe { Pill("أنت", fill: Ink.cream) }
            if isHost { Pill("القائد") }
            Spacer(minLength: 8)
            if let trailing {
                Text(trailing.bidiIsolated)
                    .font(.displaySoft(Type.body))
                    .foregroundStyle(Ink.red)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .layoutPriority(1)
            }
        }
        .opacity(dimmed ? 0.45 : 1)
        .accessibilityElement(children: .combine)
    }
}

/// كبسولة لاعب مختصرة — تُستعمل في الشبكات.
struct OnlinePlayerChip: View {
    let player: ScenePlayer
    var highlighted: Bool = false
    var dimmed: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            OnlineAvatar(player: player, size: 30, ringed: false)
            Text(player.name.bidiIsolated)
                .font(.bodyArBold(Type.meta))
                .foregroundStyle(Ink.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(highlighted ? Ink.yellow : Ink.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(highlighted ? Ink.redDeep : Ink.ink, lift: 4, radius: 14)
        .opacity(dimmed ? 0.5 : 1)
    }
}

/// شبكة اللاعبين الحاليين.
struct OnlineRoster: View {
    let players: [ScenePlayer]
    var hostID: String? = nil
    var meID: String? = nil
    var dimmedIDs: Set<String> = []

    private let columns = [GridItem(.adaptive(minimum: 140), spacing: 10)]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
            ForEach(Array(players.enumerated()), id: \.offset) { pair in
                OnlinePlayerChip(
                    player: pair.element,
                    highlighted: pair.element.id == hostID || pair.element.id == meID,
                    dimmed: dimmedIDs.contains(pair.element.id)
                )
            }
        }
    }
}

/// أزرار المشهد كما أرسلها الخادم.
struct OnlineButtonsRow: View {
    let buttons: [SceneButton]
    var enabled: Bool
    let press: (String) -> Void

    var body: some View {
        VStack(spacing: 10) {
            ForEach(Array(buttons.enumerated()), id: \.offset) { pair in
                ActionButton(SceneCopy.plain(pair.element.label).bidiIsolated,
                             systemImage: symbol(for: pair.element.style),
                             kind: kind(for: pair.element.style),
                             isEnabled: enabled && !pair.element.disabled) {
                    press(pair.element.id)
                }
            }
        }
    }

    private func kind(for style: String) -> ActionButton.Kind {
        switch style {
        case "start": return .hero
        case "join", "stop": return .solid
        default: return .quiet
        }
    }

    private func symbol(for style: String) -> String? {
        switch style {
        case "start": return "play.fill"
        case "join": return "person.badge.plus"
        case "stop": return "stop.fill"
        default: return nil
        }
    }
}

/// النص المرافق للمشهد — إلزامي للحالات الحرجة (DESIGN.md §6).
struct OnlineTextCard: View {
    let text: String

    private var clean: String { SceneCopy.plain(text) }

    var body: some View {
        if !clean.isEmpty {
            Card(padding: 14) {
                Text(clean.bidiIsolated)
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// مشهد لا يعرفه هذا الإصدار.
///
/// الخادم يتقدّم على التطبيق المنشور على الأجهزة، وهذه الحالة ستقع فعلًا.
/// البديل الوحيد المقبول عن شاشة فارغة هو بطاقة تقول للاعب أين يكمل.
struct OnlineUnknownCard: View {
    let kind: String
    var text: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            NoticeCard(
                symbol: "sparkles",
                title: "مشهد جديد لا يعرفه التطبيق",
                body: "هذه الجولة تعرض شيئًا أُضيف بعد إصدار التطبيق. تابعها في قناة السيرفر، وحدّث التطبيق ليظهر هنا."
            )
            if let text, !SceneCopy.plain(text).isEmpty {
                OnlineTextCard(text: text)
            }
            Text("النوع: \(kind.bidiIsolated)")
                .font(.bodyAr(Type.meta))
                .foregroundStyle(Ink.ink.opacity(0.7))
        }
    }
}

/// شريط حالة الوصلة الطافي.
///
/// زجاج لا بطاقة: هذا العنصر يطفو **فوق** المحتوى ولا يجلس معه في التدفّق،
/// وهو بالضبط الموضع الذي يخدمه الزجاج في هذا المشروع (انظر `Style.swift`).
struct OnlineStatusBanner: View {
    let state: SocketState
    var retry: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: state.symbol)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Ink.cream)
            Text(state.label)
                .font(.bodyArBold(Type.meta))
                .foregroundStyle(Ink.cream)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if state.isBusy {
                ProgressView().controlSize(.small).tint(Ink.cream)
            }
            if let retry, case .closed = state {
                Button(action: retry) {
                    Text("أعد المحاولة")
                        .font(.bodyArBold(Type.meta))
                        .foregroundStyle(Ink.ink)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(Ink.yellow))
                        .overlay(Capsule().strokeBorder(Ink.ink, lineWidth: 2))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .glassTinted(Ink.redDeep, cornerRadius: 22)
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 2)
        )
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
    }
}

/// سجل ما يقوله الخادم — الهمس أولًا لأنه خاص باللاعب.
struct OnlineLogCard: View {
    let messages: [GameMessage]

    private var shown: [GameMessage] {
        Array(messages.suffix(4))
    }

    var body: some View {
        if !shown.isEmpty {
            Card(padding: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    SmallHeading("من الجولة")
                    ForEach(shown) { message in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: symbol(message.kind))
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(color(message.kind))
                            Text(SceneCopy.plain(message.text).bidiIsolated)
                                .font(.bodyAr(Type.meta))
                                .foregroundStyle(Ink.ink)
                                .lineSpacing(Type.lineSpacing)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
    }

    private func symbol(_ kind: GameMessage.Kind) -> String {
        switch kind {
        case .say: return "text.bubble.fill"
        case .whisper: return "lock.fill"
        case .error: return "exclamationmark.triangle.fill"
        }
    }

    private func color(_ kind: GameMessage.Kind) -> Color {
        switch kind {
        case .say: return Ink.ink
        case .whisper: return Ink.red
        case .error: return Ink.redDeep
        }
    }
}

/// ترتيب اللاعبين — يخدم مشهد `standings` ونهاية اللعبة.
struct OnlineStandingsCard: View {
    let heading: String
    let rows: [(player: ScenePlayer, score: Int)]
    var winnerID: String? = nil

    var body: some View {
        Card(shadow: Ink.redDeep) {
            VStack(alignment: .leading, spacing: 12) {
                SmallHeading(heading)
                if rows.isEmpty {
                    Text("لا نتائج في هذه الجولة.")
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink)
                } else {
                    ForEach(Array(rows.enumerated()), id: \.offset) { pair in
                        OnlinePlayerRow(
                            player: pair.element.player,
                            isHost: pair.element.player.id == winnerID,
                            trailing: onlineNumber(pair.element.score)
                        )
                    }
                }
            }
        }
    }
}
