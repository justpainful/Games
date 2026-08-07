import SwiftUI

private let latinLocale = Locale(identifier: "en_US_POSIX")

private func numText(_ value: Int) -> String {
    value.formatted(.number.locale(latinLocale))
}

private func errorText(_ error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? "تعذّر الاتصال بالخادم. حاول مرة أخرى."
}

/// المحفظة المعروضة في الصدارة — القيم مطابقة لـ `Wallet` في `src/players/points.ts`.
private enum LeaderWallet: String, CaseIterable, Identifiable, Hashable {
    case solo, team, roulette, total

    var id: String { rawValue }

    var title: String {
        switch self {
        case .solo: "فردية"
        case .team: "جماعية"
        case .roulette: "روليت"
        case .total: "المجموع"
        }
    }
}

private enum LeadersPhase: Equatable {
    case loading
    case ready
    case failed(String)
}

/// لوحة الصدارة لسيرفر واحد.
///
/// النقاط مفصولة لكل سيرفر، فالجدول بلا سيرفر مختار لا معنى له — تلك حالة
/// مستقلة عن "لا نتائج" ولها رسالتها.
struct LeadersView: View {
    @Environment(AppState.self) private var app

    @State private var wallet: LeaderWallet = .solo
    @State private var rows: [LeaderRow] = []
    @State private var phase: LeadersPhase = .loading

    private var activeGuild: Guild? {
        app.guilds.first { $0.id == app.activeGuildID }
    }

    /// مفتاح واحد يجمع السيرفر والمحفظة: أي تغيّر في أيّهما يعيد الجلب.
    private var loadKey: String {
        "\(app.activeGuildID ?? "-")|\(wallet.rawValue)"
    }

    var body: some View {
        ZStack {
            Ink.paper.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    TopBar("«الصدارة»", trailing: activeGuild?.name.bidiIsolated)

                    walletPicker

                    switch phase {
                    case .loading:
                        loadingCard
                    case .failed(let message):
                        errorCard(message)
                    case .ready:
                        if rows.isEmpty {
                            emptyCard
                        } else {
                            ForEach(rows) { row in
                                LeaderRowCard(row: row)
                            }
                        }
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .refreshable { await load(showSpinner: false) }
        }
        .task(id: loadKey) { await load(showSpinner: true) }
    }

    // ————— أجزاء الشاشة —————

    private var walletPicker: some View {
        Picker("المحفظة", selection: $wallet) {
            ForEach(LeaderWallet.allCases) { option in
                Text(option.title).tag(option)
            }
        }
        .pickerStyle(.segmented)
        .tint(Ink.red)
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Ink.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(Ink.ink, lift: 5, radius: 16)
    }

    private var loadingCard: some View {
        Card(shadow: Ink.ink, padding: 24) {
            VStack(spacing: 12) {
                ProgressView().tint(Ink.ink)
                Text("جارٍ جلب الصدارة…")
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink.opacity(0.7))
            }
            .frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder
    private var emptyCard: some View {
        if app.activeGuildID == nil {
            messageCard(
                icon: "server.rack",
                title: "لم تختر سيرفرًا",
                detail: "النقاط مفصولة لكل سيرفر. اختر سيرفرك من «حسابي» لتظهر الصدارة."
            )
        } else {
            messageCard(
                icon: "trophy",
                title: "لا نقاط بعد",
                detail: "لم يسجّل أحد نقاطًا في محفظة «\(wallet.title)» داخل هذا السيرفر. أول جولة تفتح اللوحة."
            )
        }
    }

    private func messageCard(icon: String, title: String, detail: String) -> some View {
        Card(shadow: Ink.ink, padding: 22) {
            VStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 38, weight: .bold))
                    .foregroundStyle(Ink.red)
                Text(title)
                    .font(.displaySoft(Type.title))
                    .foregroundStyle(Ink.ink)
                    .multilineTextAlignment(.center)
                Text(detail)
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .lineSpacing(Type.lineSpacing)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .combine)
    }

    private func errorCard(_ message: String) -> some View {
        Card(shadow: Ink.redDeep, padding: 18) {
            VStack(alignment: .leading, spacing: 12) {
                Pill("تعذّر الجلب", fill: Ink.red, textColor: Ink.cream)
                Text(message)
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    Task { await load(showSpinner: true) }
                } label: {
                    Text("إعادة المحاولة")
                        .font(.bodyArBold(Type.label))
                        .foregroundStyle(Ink.ink)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(Ink.yellow))
                        .overlay(Capsule().strokeBorder(Ink.ink, lineWidth: 2))
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // ————— الجلب —————

    @MainActor
    private func load(showSpinner: Bool) async {
        guard let guildID = app.activeGuildID, !guildID.isEmpty else {
            rows = []
            phase = .ready
            return
        }
        if showSpinner { phase = .loading }
        do {
            let fetched: [LeaderRow] = try await API.shared
                .get("/leaders/\(guildID)?wallet=\(wallet.rawValue)")
            // `rank` اختياري في الرد وقيمته الافتراضية صفر — عندها الترتيب
            // يُشتق من موضع الصف، فلا يظهر «المركز 0» في اللوحة.
            rows = fetched.enumerated().map { pair in
                var copy = pair.element
                if copy.rank <= 0 { copy.rank = pair.offset + 1 }
                return copy
            }
            phase = .ready
        } catch {
            rows = []
            phase = .failed(errorText(error))
        }
    }
}

/// صف واحد في اللوحة.
private struct LeaderRowCard: View {
    let row: LeaderRow

    /// المركز مضبوط قبل الوصول إلى هنا — انظر `load`.
    private var rank: Int { max(row.rank, 1) }

    /// المراكز الثلاثة الأولى مميّزة: الأول أصفر بظل أحمر (توقيع الهوية).
    private var badgeFill: Color {
        switch rank {
        case 1: Ink.yellow
        case 2: Ink.red
        case 3: Ink.ink
        default: Ink.surface
        }
    }

    private var badgeText: Color {
        switch rank {
        case 1: Ink.ink
        case 2, 3: Ink.cream
        default: Ink.ink
        }
    }

    private var cardShadow: Color {
        rank == 1 ? Ink.redDeep : Ink.ink
    }

    var body: some View {
        Card(shadow: cardShadow, padding: 14) {
            HStack(spacing: 12) {
                Text(numText(rank))
                    .font(.displaySoft(Type.body))
                    .foregroundStyle(badgeText)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(badgeFill))
                    .overlay(Circle().strokeBorder(Ink.ink, lineWidth: 3))
                    .accessibilityLabel("المركز \(rank)")

                LeaderAvatar(
                    url: row.avatarURL(size: 128),
                    fallback: row.displayName,
                    ringed: rank == 1
                )

                Text(row.displayName.bidiIsolated)
                    .font(.bodyArBold(Type.body))
                    .foregroundStyle(Ink.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .minimumScaleFactor(0.7)

                Spacer(minLength: 8)

                Text(numText(row.points))
                    .font(.displaySoft(Type.title))
                    .foregroundStyle(rank == 1 ? Ink.red : Ink.ink)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .layoutPriority(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

/// أفتار صغير للصف — حلقة صفراء لصاحب المركز الأول وحده (DESIGN.md §5).
private struct LeaderAvatar: View {
    let url: URL?
    let fallback: String
    var ringed: Bool = false

    private var initial: String {
        let trimmed = fallback.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "؟" : String(trimmed.prefix(1))
    }

    var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .empty:
                        ProgressView().controlSize(.small).tint(Ink.ink)
                    case .failure:
                        letterFallback
                    @unknown default:
                        letterFallback
                    }
                }
            } else {
                letterFallback
            }
        }
        .frame(width: 40, height: 40)
        .background(Circle().fill(Ink.cream))
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Ink.ink, lineWidth: 3))
        .padding(ringed ? 3 : 0)
        .overlay {
            if ringed { Circle().strokeBorder(Ink.yellow, lineWidth: 3) }
        }
        .accessibilityHidden(true)
    }

    private var letterFallback: some View {
        Text(initial.bidiIsolated)
            .font(.displaySoft(16))
            .foregroundStyle(Ink.ink)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Ink.yellow)
    }
}
