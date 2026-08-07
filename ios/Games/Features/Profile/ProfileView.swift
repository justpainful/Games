import SwiftUI

/// أرقام الواجهة لاتينية `0-9` دائمًا (DESIGN.md §4).
///
/// بلا لغة ثابتة يطبع `formatted()` أرقامًا هندية `٩٩٩٬٩٩٩` على جهاز لغته
/// عربية، فتختلف الأرقام بين جهاز وآخر داخل نفس التصميم.
private let latinLocale = Locale(identifier: "en_US_POSIX")

private func numText(_ value: Int) -> String {
    value.formatted(.number.locale(latinLocale))
}

private func errorText(_ error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? "تعذّر الاتصال بالخادم. حاول مرة أخرى."
}

/// شاشة الحساب.
///
/// كل ما فيها يُقرأ من `AppState` لا من جلب خاص: البروفايل والصدارة يجب أن
/// يعرضا نفس الرصيد بعد أي لعبة.
struct ProfileView: View {
    @Environment(AppState.self) private var app

    @State private var showSignOutConfirm = false
    @State private var showSettings = false
    @State private var loadError: String?
    @State private var switchingGuild = false

    private var activeGuild: Guild? {
        app.guilds.first { $0.id == app.activeGuildID }
    }

    var body: some View {
        ZStack {
            Ink.paper.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    TopBar("«حسابي»", trailing: activeGuild?.name.bidiIsolated)

                    if let account = app.account {
                        identityCard(account)
                        pointsCard
                        statsRow
                        guildSwitcher
                        actionsCard
                    } else {
                        // حالة نادرة: الطور `signedIn` والحساب غائب بعد فشل تحديث.
                        placeholderCard
                    }

                    if let loadError {
                        errorCard(loadError)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .refreshable { await reloadAll() }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environment(\.layoutDirection, .rightToLeft)
        }
        .confirmationDialog(
            "تسجيل الخروج من الحساب؟",
            isPresented: $showSignOutConfirm,
            titleVisibility: .visible
        ) {
            Button("تسجيل الخروج", role: .destructive) { app.signOut() }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("ستحتاج إلى تسجيل الدخول بديسكورد مرة أخرى. نقاطك محفوظة على الخادم ولن تُفقد.")
        }
    }

    // ————— الهوية —————

    private func identityCard(_ account: Account) -> some View {
        Card(shadow: Ink.ink, padding: 20) {
            VStack(spacing: 14) {
                ProfileAvatar(
                    url: account.avatarURL(size: 256),
                    fallback: account.shownName,
                    size: 116
                )

                // الاسم الظاهر وحده هو ما يُعرض بارزًا؛ `username` تحته باهتًا
                // وبعلامة `@` حتى لا يُقرأ اسمًا ثانيًا.
                Text(account.shownName.bidiIsolated)
                    .font(.display(30))
                    .foregroundStyle(Ink.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.55)
                    .fixedSize(horizontal: false, vertical: true)

                Text("@\(account.username)".bidiIsolated)
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink.opacity(0.55))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .combine)
    }

    private var placeholderCard: some View {
        Card(shadow: Ink.ink, padding: 20) {
            VStack(spacing: 12) {
                ProgressView().tint(Ink.ink)
                Text("جارٍ تحميل بيانات حسابك…")
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink.opacity(0.7))
            }
            .frame(maxWidth: .infinity)
        }
    }

    // ————— النقاط —————

    private var pointsCard: some View {
        Card(shadow: Ink.redDeep, padding: 18) {
            VStack(spacing: 12) {
                Text("مجموع النقاط")
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink.opacity(0.6))

                Text(numText(app.points.total))
                    .font(.display(52))
                    .foregroundStyle(Ink.red)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)

                if activeGuild == nil {
                    Text("اختر سيرفرًا لعرض نقاطك — النقاط مفصولة لكل سيرفر.")
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink.opacity(0.6))
                        .multilineTextAlignment(.center)
                        .lineSpacing(Type.lineSpacing)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    // الأرقام الكبيرة (999,999) تُوسّع الكبسولات؛ التصغير المحدود
                    // يبقيها في سطر واحد بدل أن تُقصّ.
                    HStack(spacing: 8) {
                        Pill("روليت \(numText(app.points.roulette))")
                        Pill("جماعية \(numText(app.points.team))")
                        Pill("فردية \(numText(app.points.solo))")
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var statsRow: some View {
        HStack(spacing: 12) {
            statBox(title: "الألعاب", value: numText(app.points.gamesPlayed))
            statBox(title: "نسبة الفوز", value: winRateText)
        }
    }

    /// بلا جولات لا توجد نسبة — `0%` كذبة تُقرأ خسارة كاملة.
    private var winRateText: String {
        guard app.points.gamesPlayed > 0 else { return "—" }
        return app.points.winRate.formatted(
            .percent.precision(.fractionLength(0)).locale(latinLocale)
        )
    }

    private func statBox(title: String, value: String) -> some View {
        Card(shadow: Ink.ink, padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink.opacity(0.6))
                Text(value)
                    .font(.displaySoft(Type.title))
                    .foregroundStyle(Ink.ink)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // ————— السيرفر —————

    @ViewBuilder
    private var guildSwitcher: some View {
        if app.guilds.isEmpty {
            Card(shadow: Ink.ink, padding: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("لا سيرفر مشترك")
                        .font(.bodyArBold(Type.body))
                        .foregroundStyle(Ink.ink)
                    Text("أضف البوت إلى سيرفرك ثم اسحب للتحديث.")
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink.opacity(0.65))
                        .lineSpacing(Type.lineSpacing)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            Menu {
                ForEach(app.guilds) { guild in
                    Button {
                        select(guild)
                    } label: {
                        Label(
                            guild.name.bidiIsolated,
                            systemImage: guild.id == app.activeGuildID ? "checkmark.circle.fill" : "circle"
                        )
                    }
                }
            } label: {
                Card(shadow: Ink.ink, padding: 16) {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("السيرفر")
                                .font(.bodyAr(Type.meta))
                                .foregroundStyle(Ink.ink.opacity(0.6))
                            Text((activeGuild?.name ?? "لم يُختر بعد").bidiIsolated)
                                .font(.bodyArBold(Type.body))
                                .foregroundStyle(Ink.ink)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                        Spacer(minLength: 8)
                        if switchingGuild {
                            ProgressView().controlSize(.small).tint(Ink.ink)
                        } else {
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(Ink.ink.opacity(0.7))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("تبديل السيرفر")
        }
    }

    // ————— الأفعال —————

    private var actionsCard: some View {
        VStack(spacing: 12) {
            Button {
                showSettings = true
            } label: {
                rowLabel(title: "الإعدادات", icon: "slider.horizontal.3", fill: Ink.surface, tint: Ink.ink)
            }
            .buttonStyle(.plain)

            Button {
                showSignOutConfirm = true
            } label: {
                rowLabel(title: "تسجيل الخروج", icon: "rectangle.portrait.and.arrow.right", fill: Ink.red, tint: Ink.cream)
            }
            .buttonStyle(.plain)
        }
    }

    private func rowLabel(title: String, icon: String, fill: Color, tint: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(tint)
            Text(title)
                .font(.bodyArBold(Type.body))
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(fill))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(Ink.ink, lift: 5, radius: 16)
    }

    private func errorCard(_ message: String) -> some View {
        Card(shadow: Ink.redDeep, padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Pill("تعذّر التحديث", fill: Ink.red, textColor: Ink.cream)
                Text(message)
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    // ————— السلوك —————

    @MainActor
    private func select(_ guild: Guild) {
        guard guild.id != app.activeGuildID else { return }
        app.activeGuildID = guild.id
        Task { await reloadPoints() }
    }

    @MainActor
    private func reloadPoints() async {
        switchingGuild = true
        defer { switchingGuild = false }
        do {
            try await app.refreshPoints()
            loadError = nil
        } catch {
            loadError = errorText(error)
        }
    }

    @MainActor
    private func reloadAll() async {
        do {
            try await app.refresh()
            loadError = nil
        } catch {
            loadError = errorText(error)
        }
    }
}

/// أفتار المستخدم — دائرة بحدّ أسود سميك وحلقة صفراء بظل أحمر.
///
/// `AsyncImage` قد يبقى في `.empty` إلى الأبد إن كان الرابط `nil`، لذلك
/// البديل الحرفي يُرسم في حالتَي الفشل والرابط الغائب معًا.
private struct ProfileAvatar: View {
    let url: URL?
    let fallback: String
    var size: CGFloat = 116

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
                        ProgressView().tint(Ink.ink)
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
        .frame(width: size, height: size)
        .background(Circle().fill(Ink.cream))
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Ink.ink, lineWidth: 4))
        .padding(5)
        .overlay(Circle().strokeBorder(Ink.yellow, lineWidth: 5))
        .hardShadow(Ink.redDeep, lift: 6, radius: 999)
        .accessibilityLabel("صورة الحساب")
    }

    /// البديل أصفر بحبر أسود: `paperTint` لا يحمل نصًا أبدًا (DESIGN.md §3).
    private var letterFallback: some View {
        Text(initial.bidiIsolated)
            .font(.display(size * 0.42))
            .foregroundStyle(Ink.ink)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Ink.yellow)
    }
}
