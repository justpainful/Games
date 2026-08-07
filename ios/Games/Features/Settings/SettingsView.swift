import SwiftUI

/// الإعدادات — تُفتح من البروفايل.
///
/// مستوى الصعوبة يُخزَّن في `UserDefaults` تحت `botSkill` لا في `AppState`:
/// تفضيل جهاز لا حالة حساب، ويجب أن يبقى بعد تسجيل الخروج والدخول.
struct SettingsView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @AppStorage("botSkill") private var botSkill: Skill = .normal

    @State private var showSignOutConfirm = false
    @State private var switchError: String?
    @State private var switching = false

    private var activeGuild: Guild? {
        app.guilds.first { $0.id == app.activeGuildID }
    }

    var body: some View {
        ZStack {
            Ink.paper.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    header
                    guildSection
                    skillSection
                    aboutSection
                    signOutButton
                    if let switchError {
                        errorCard(switchError)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
        }
        .presentationDragIndicator(.visible)
        .confirmationDialog(
            "تسجيل الخروج من الحساب؟",
            isPresented: $showSignOutConfirm,
            titleVisibility: .visible
        ) {
            Button("تسجيل الخروج", role: .destructive) {
                // الإغلاق أولًا: ترك الورقة مفتوحة بينما يُستبدل الجذر بشاشة
                // الدخول يترك طبقة معلّقة فوقها.
                dismiss()
                app.signOut()
            }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("نقاطك محفوظة على الخادم ولن تُفقد.")
        }
    }

    // ————— الرأس —————

    private var header: some View {
        HStack(spacing: 12) {
            TopBar("«الإعدادات»")
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(Ink.ink)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Ink.yellow))
                    .overlay(Circle().strokeBorder(Ink.ink, lineWidth: 3))
                    .hardShadow(Ink.redDeep, lift: 5, radius: 999)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("إغلاق")
        }
    }

    // ————— السيرفر —————

    @ViewBuilder
    private var guildSection: some View {
        section("«السيرفر»") {
            if app.guilds.isEmpty {
                Text("لا سيرفر مشترك مع البوت بعد.")
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink.opacity(0.65))
                    .lineSpacing(Type.lineSpacing)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Menu {
                    ForEach(app.guilds) { guild in
                        Button {
                            select(guild)
                        } label: {
                            Label(
                                guild.name.bidiIsolated,
                                systemImage: guild.id == app.activeGuildID
                                    ? "checkmark.circle.fill" : "circle"
                            )
                        }
                    }
                } label: {
                    HStack(spacing: 10) {
                        Text((activeGuild?.name ?? "لم يُختر بعد").bidiIsolated)
                            .font(.bodyArBold(Type.body))
                            .foregroundStyle(Ink.ink)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        Spacer(minLength: 8)
                        if switching {
                            ProgressView().controlSize(.small).tint(Ink.ink)
                        } else {
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(Ink.ink.opacity(0.7))
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Ink.paper)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(Ink.ink, lineWidth: 2)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("تبديل السيرفر")

                Text("النقاط مفصولة لكل سيرفر — تبديل السيرفر يبدّل رصيدك المعروض.")
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink.opacity(0.6))
                    .lineSpacing(Type.lineSpacing)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    // ————— صعوبة البوت —————

    private var skillSection: some View {
        section("«الخصم الآلي»") {
            Picker("مستوى الصعوبة", selection: $botSkill) {
                ForEach(Skill.allCases, id: \.self) { skill in
                    Text(skill.title).tag(skill)
                }
            }
            .pickerStyle(.segmented)
            .tint(Ink.red)

            Text(skillHint)
                .font(.bodyAr(Type.meta))
                .foregroundStyle(Ink.ink.opacity(0.6))
                .lineSpacing(Type.lineSpacing)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var skillHint: String {
        switch botSkill {
        case .easy: "يخطئ كثيرًا ويتأنّى قبل أن يلعب — مناسب للبداية."
        case .normal: "يوازن بين الخطأ والصواب، ويردّ بسرعة معقولة."
        case .hard: "نادرًا ما يخطئ ويردّ سريعًا — لا تتوقّع فوزًا سهلًا."
        }
    }

    // ————— عن التطبيق —————

    private var aboutSection: some View {
        section("«عن التطبيق»") {
            infoRow(label: "الإصدار", value: appVersion.bidiIsolated)
            infoRow(label: "الحساب", value: (app.account?.shownName ?? "—").bidiIsolated)
            infoRow(label: "عدد السيرفرات", value: "\(app.guilds.count)".bidiIsolated)

            Text("ألعاب جماعية سريعة داخل سيرفرات ديسكورد. الدخول عبر ديسكورد وحده — لا نحفظ كلمة مرور.")
                .font(.bodyAr(Type.meta))
                .foregroundStyle(Ink.ink.opacity(0.6))
                .lineSpacing(Type.lineSpacing)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var appVersion: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        guard let short, !short.isEmpty else { return "—" }
        guard let build, !build.isEmpty else { return short }
        return "\(short) (\(build))"
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.bodyAr(Type.label))
                .foregroundStyle(Ink.ink.opacity(0.6))
            Spacer(minLength: 8)
            Text(value)
                .font(.bodyArBold(Type.label))
                .foregroundStyle(Ink.ink)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // ————— الخروج —————

    private var signOutButton: some View {
        Button {
            showSignOutConfirm = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Ink.cream)
                Text("تسجيل الخروج")
                    .font(.bodyArBold(Type.body))
                    .foregroundStyle(Ink.cream)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Ink.red))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Ink.ink, lineWidth: 3)
            )
            .hardShadow(Ink.ink, lift: 5, radius: 16)
        }
        .buttonStyle(.plain)
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

    // ————— أدوات —————

    private func section<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        Card(shadow: Ink.ink, padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text(title)
                    .font(.displaySoft(Type.title))
                    .foregroundStyle(Ink.red)
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // ————— السلوك —————

    @MainActor
    private func select(_ guild: Guild) {
        guard guild.id != app.activeGuildID else { return }
        app.activeGuildID = guild.id
        Task {
            switching = true
            defer { switching = false }
            do {
                try await app.refreshPoints()
                switchError = nil
            } catch {
                switchError = (error as? LocalizedError)?.errorDescription
                    ?? "تعذّر تحديث النقاط لهذا السيرفر."
            }
        }
    }
}
