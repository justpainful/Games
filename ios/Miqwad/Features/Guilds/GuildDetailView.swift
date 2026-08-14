import SwiftUI

/// إعدادات سيرفر واحد: العام، والرتب، والألعاب.
///
/// ————————————————— لماذا لا يُحفظ بزرّ —————————————————
///
/// كل مفتاح يُرسل وحده لحظة قلبه، ولا يوجد «حفظ» في آخر الشاشة. زرّ الحفظ
/// يعني حالة معلّقة على الجوال: يقلب ثلاثة مفاتيح، يخرج من الشاشة، ويظنّها
/// انحفظت. والاستثناء الوحيد هو ما يُكتب بالحروف — البادئة والاسم — فالحرف
/// الواحد ليس قرارًا، ويُرسل عند تمام الكتابة.
struct GuildDetailView: View {
    let guildId: String
    let name: String

    @Environment(Hub.self) private var hub
    @State private var page = Page.general
    @State private var prefix = ""
    @State private var nickname = ""
    @State private var tuning: GameSetting?

    enum Page: String, CaseIterable {
        case general = "عام"
        case roles = "الرتب"
        case games = "الألعاب"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Metric.spaceSm) {
                TopBar(name, trailing: hub.checking ? "…" : nil)
                picker

                if let view = hub.opened, view.guild.id == guildId {
                    switch page {
                    case .general: general(view)
                    case .roles: roles(view)
                    case .games: games(view)
                    }
                } else {
                    Card {
                        HStack(spacing: 10) {
                            ProgressView().tint(Ink.red)
                            Text("أقرأ الإعدادات…")
                                .font(.bodyArBold(Type.body))
                                .foregroundStyle(Ink.ink)
                        }
                    }
                }

                if let said = hub.saying {
                    Text(said)
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink.opacity(0.7))
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
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $tuning) { game in
            GameKnobsView(game: game)
        }
        .task {
            await hub.open(guildId)
            prefix = hub.opened?.prefix ?? ""
            nickname = hub.opened?.nickname ?? ""
        }
    }

    private var picker: some View {
        HStack(spacing: 8) {
            ForEach(Page.allCases, id: \.self) { one in
                Button { page = one } label: {
                    Text(one.rawValue)
                        .font(.bodyArBold(Type.label))
                        .foregroundStyle(page == one ? Ink.cream : Ink.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(page == one ? Ink.ink : Ink.cream)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(Ink.ink, lineWidth: 2.5)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // ————————————————————— عام —————————————————————

    @ViewBuilder
    private func general(_ view: GuildView) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                labelled("البادئة") {
                    HStack(spacing: 8) {
                        TextField("!", text: $prefix)
                            .font(.bodyArBold(Type.body))
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .frame(width: 70)
                            .padding(8)
                            .background(RoundedRectangle(cornerRadius: 10).fill(Ink.cream))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Ink.ink, lineWidth: 2))
                            .onSubmit { send(.text("prefix", prefix)) }
                        Text("مثال: \(prefix.isEmpty ? "!" : prefix)اشبك")
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink.opacity(0.6))
                        Spacer()
                    }
                }

                switchRow("البادئة شغّالة", view.prefixEnabled) { send(.flag("prefixEnabled", $0)) }
                switchRow("أوامر بلا بادئة", view.bareCommands) { send(.flag("bareCommands", $0)) }

                Text("أسماء الألعاب كلمات عربية عادية، فتشغيل هذا يجعل كل محادثة قابلة لبدء لعبة بالخطأ.")
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink.opacity(0.6))
            }
        }

        Text("القنوات")
            .font(.displaySoft(Type.title))
            .foregroundStyle(Ink.ink)
            .padding(.top, 6)

        Card {
            VStack(alignment: .leading, spacing: 14) {
                choice("قناة الألعاب", view.gamesChannel, view.allChannels, "أي قناة") {
                    send(.pick("gamesChannel", $0))
                }
                choice("قناة الصدارة", view.leadersChannel, view.allChannels, "بلا لوحة") {
                    send(.pick("leadersChannel", $0))
                }
            }
        }

        Card {
            labelled("اسم البوت في هذا السيرفر") {
                HStack(spacing: 8) {
                    TextField("Games", text: $nickname)
                        .font(.bodyAr(Type.body))
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Ink.cream))
                        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Ink.ink, lineWidth: 2))
                        .onSubmit { send(.pick("nickname", nickname.isEmpty ? nil : nickname)) }
                }
            }
        }
    }

    // ————————————————————— الرتب —————————————————————

    @ViewBuilder
    private func roles(_ view: GuildView) -> some View {
        ForEach(["ADMIN", "GAMES", "POINTS"], id: \.self) { kind in
            Text(title(of: kind))
                .font(.displaySoft(Type.title))
                .foregroundStyle(Ink.ink)
                .padding(.top, 6)

            Card {
                VStack(alignment: .leading, spacing: 10) {
                    Text(about(of: kind))
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink.opacity(0.65))

                    if view.allRoles.isEmpty {
                        Text("ما قرأت رتب هذا السيرفر.")
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink.opacity(0.6))
                    }

                    ForEach(view.allRoles) { role in
                        let on = view.roles.of(kind).contains(role.id)
                        Button { send(.role(kind, role.id, !on)) } label: {
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(tint(role.color))
                                    .frame(width: 12, height: 12)
                                    .overlay(Circle().strokeBorder(Ink.ink, lineWidth: 1.5))
                                Text(role.name.bidiIsolated)
                                    .font(.bodyAr(Type.label))
                                    .foregroundStyle(Ink.ink)
                                Spacer(minLength: 8)
                                Image(systemName: on ? "checkmark.square.fill" : "square")
                                    .foregroundStyle(on ? Ink.red : Ink.ink.opacity(0.35))
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func title(of kind: String) -> String {
        switch kind {
        case "ADMIN": "الإدارة"
        case "GAMES": "بدء الألعاب"
        default: "إعطاء النقاط"
        }
    }

    private func about(of kind: String) -> String {
        switch kind {
        case "ADMIN": "تبدأ الألعاب وتوقفها وتفتح لوحات الإعداد."
        case "GAMES": "تبدأ الألعاب والإيفنتات فقط."
        default: "تعطي النقاط وتخصمها."
        }
    }

    /// لون الرتبة كما في ديسكورد. الصفر يعني «بلا لون»، وعرضه أسودَ يوهم بلون.
    private func tint(_ color: Int?) -> Color {
        guard let color, color > 0 else { return Ink.ink.opacity(0.2) }
        return Color(
            red: Double((color >> 16) & 0xFF) / 255,
            green: Double((color >> 8) & 0xFF) / 255,
            blue: Double(color & 0xFF) / 255
        )
    }

    // ————————————————————— الألعاب —————————————————————

    @ViewBuilder
    private func games(_ view: GuildView) -> some View {
        let on = view.games.filter(\.enabled).count
        Text("\(on) شغّالة من \(view.games.count)")
            .font(.bodyAr(Type.label))
            .foregroundStyle(Ink.ink.opacity(0.7))

        ForEach(view.games) { game in
            Card(shadow: game.enabled ? Ink.ink : Ink.ink.opacity(0.35)) {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(game.name)
                            .font(.bodyArBold(Type.body))
                            .foregroundStyle(Ink.ink)
                        Text(game.tagline)
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink.opacity(0.65))
                        HStack(spacing: 8) {
                            Text("\(game.minPlayers) إلى \(game.maxPlayers) لاعب")
                                .font(.bodyAr(Type.meta))
                                .foregroundStyle(Ink.ink.opacity(0.5))
                            // زرّ الضبط لا يظهر للعبة بلا مقابض: زرّ يفتح شاشة
                            // فارغة يُفهم أنه عطل لا أنه لا شيء هنا
                            if !game.tuning.isEmpty {
                                Button { tuning = game } label: {
                                    Text("ضبط")
                                        .font(.bodyArBold(Type.meta))
                                        .foregroundStyle(Ink.ink)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 3)
                                        .background(Capsule().fill(Ink.yellow))
                                        .overlay(Capsule().strokeBorder(Ink.ink, lineWidth: 2))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    Spacer(minLength: 8)
                    Toggle("", isOn: Binding(
                        get: { game.enabled },
                        set: { send(.game(game.key, $0)) }
                    ))
                    .labelsHidden()
                    .tint(Ink.red)
                }
            }
        }
    }

    // ————————————————————— قطع مشتركة —————————————————————

    private func send(_ change: Change) {
        Task { await hub.change(change) }
    }

    private func labelled<Content: View>(
        _ text: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(text)
                .font(.bodyArBold(Type.label))
                .foregroundStyle(Ink.ink)
            content()
        }
    }

    private func switchRow(_ text: String, _ on: Bool, _ set: @escaping (Bool) -> Void) -> some View {
        Toggle(isOn: Binding(get: { on }, set: set)) {
            Text(text)
                .font(.bodyArBold(Type.label))
                .foregroundStyle(Ink.ink)
        }
        .tint(Ink.red)
    }

    private func choice(
        _ text: String,
        _ picked: String?,
        _ all: [Choice],
        _ empty: String,
        _ set: @escaping (String?) -> Void
    ) -> some View {
        labelled(text) {
            Menu {
                Button(empty) { set(nil) }
                ForEach(all) { option in
                    Button("#\(option.name)") { set(option.id) }
                }
            } label: {
                HStack {
                    Text(all.first { $0.id == picked }.map { "#\($0.name)" } ?? empty)
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink)
                    Spacer()
                    Image(systemName: "chevron.down").foregroundStyle(Ink.ink.opacity(0.5))
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(Ink.cream))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Ink.ink, lineWidth: 2))
            }
        }
    }
}
