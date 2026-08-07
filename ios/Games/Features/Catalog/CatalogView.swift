import SwiftUI

/// الشاشة الرئيسية: كل ألعاب الكتالوج مقسّمة أقسامًا مع بحث.
struct CatalogView: View {
    @State private var query = ""
    @State private var path: [PlayRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                Ink.paper.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        TopBar("الألعاب", trailing: countLabel)
                        SearchField(text: $query)

                        if sections.isEmpty {
                            NoticeCard(symbol: "magnifyingglass",
                                       title: "لا نتائج",
                                       body: "لا توجد لعبة بهذا الاسم. جرّب كلمة أقصر أو امسح البحث.")
                        } else {
                            ForEach(sections) { section in
                                VStack(alignment: .leading, spacing: 14) {
                                    SectionTitle(section.title)
                                    ForEach(section.games) { game in
                                        GameCardButton(game: game) { open(game) }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                    .padding(.bottom, 40)
                    .frame(maxWidth: 560)
                    .frame(maxWidth: .infinity)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: PlayRoute.self) { route in
                PlayDestination(route: route, path: $path)
            }
        }
    }

    // ————— بيانات الشاشة —————

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var sections: [CatalogSection] {
        var built: [CatalogSection] = []
        let words = Catalog.words.filter { matches($0) }
        if !words.isEmpty {
            built.append(CatalogSection(id: "words", title: "كلمات ومعرفة", games: words))
        }
        let duels = Catalog.duels.filter { matches($0) }
        if !duels.isEmpty {
            built.append(CatalogSection(id: "duels", title: "مواجهات", games: duels))
        }
        let groups = Catalog.groups.filter { matches($0) }
        if !groups.isEmpty {
            built.append(CatalogSection(id: "groups", title: "جماعية", games: groups))
        }
        return built
    }

    private var countLabel: String {
        let shown = sections.reduce(0) { $0 + $1.games.count }
        return "\(shown) لعبة"
    }

    /// البحث يقارن بعد التسوية، فمن كتب «العاب» بلا همزة يجدها أيضًا.
    private func matches(_ game: GameInfo) -> Bool {
        guard !trimmedQuery.isEmpty else { return true }
        let needle = LocalQuestions.normalize(trimmedQuery)
        guard !needle.isEmpty else { return true }
        let haystack = LocalQuestions.normalize("\(game.title) \(game.tagline) \(game.id)")
        return haystack.contains(needle)
    }

    /// دفعة واحدة لكل ضغطة: الضغط المزدوج السريع لا يكدّس الشاشة نفسها مرتين.
    private func open(_ game: GameInfo) {
        let route = PlayRoute.detail(game.id)
        guard path.last != route else { return }
        path.append(route)
    }
}

/// قسم في الكتالوج.
struct CatalogSection: Identifiable {
    let id: String
    let title: String
    let games: [GameInfo]
}

// ————— تفاصيل اللعبة —————

/// بطاقة تعريف اللعبة وطريقة اللعب ومدخلا اللعب.
struct GameDetailView: View {
    let game: GameInfo
    @Binding var path: [PlayRoute]

    var body: some View {
        GameScreen(title: game.title, trailing: modeLabel) {
            Card(shadow: Ink.redDeep) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 14) {
                        GameIcon(symbol: game.symbol, size: 62)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(game.title)
                                .font(.display(Type.title))
                                .foregroundStyle(Ink.red)
                                .lineLimit(2)
                                .minimumScaleFactor(0.6)
                            Text(game.tagline)
                                .font(.bodyAr(Type.label))
                                .foregroundStyle(Ink.ink)
                                .lineLimit(2)
                                .minimumScaleFactor(0.7)
                        }
                        Spacer(minLength: 0)
                    }

                    HStack(spacing: 8) {
                        Pill(playersLabel(for: game))
                        if game.soloable {
                            Pill("تُلعب وحدك", fill: Ink.cream)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }

            Card {
                VStack(alignment: .leading, spacing: 10) {
                    SmallHeading("طريقة اللعب")
                    Text(game.howTo)
                        .font(.bodyAr(Type.body))
                        .foregroundStyle(Ink.ink)
                        .lineSpacing(Type.lineSpacing)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            if game.soloable {
                ActionButton("العب ضد الخصم الآلي", systemImage: "cpu.fill", kind: .hero) {
                    push(.solo(game.id))
                }
            }

            ActionButton("العب في السيرفر", systemImage: "person.3.fill", kind: .solid) {
                push(.lobby(game.id))
            }

            if !game.soloable {
                Text("هذه اللعبة تحتاج لاعبين آخرين، فلا يمكن لعبها ضد الخصم الآلي.")
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private func push(_ route: PlayRoute) {
        guard path.last != route else { return }
        path.append(route)
    }

    private var modeLabel: String {
        switch game.mode {
        case .typing: return "كتابة"
        case .board: return "لوحة"
        case .duel: return "مواجهة"
        case .wheel: return "عجلة"
        case .poll: return "تصويت"
        case .phase: return "أطوار"
        case .teams: return "فرق"
        }
    }
}

// ————— عناصر مشتركة في الكتالوج —————

/// بطاقة لعبة قابلة للضغط.
struct GameCardButton: View {
    let game: GameInfo
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Card {
                HStack(spacing: 14) {
                    GameIcon(symbol: game.symbol, size: 54)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(game.title)
                            .font(.displaySoft(Type.body))
                            .foregroundStyle(Ink.red)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text(game.tagline)
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                        Pill(playersLabel(for: game))
                    }

                    Spacer(minLength: 0)

                    Image(systemName: "chevron.forward")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Ink.ink)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

/// أيقونة اللعبة داخل قرص أصفر بظل أحمر — إطار لا مربّع (DESIGN.md §5).
struct GameIcon: View {
    let symbol: String
    var size: CGFloat = 54

    var body: some View {
        ZStack {
            Circle().fill(Ink.yellow)
            Circle().strokeBorder(Ink.ink, lineWidth: 3)
            Image(systemName: symbol)
                .font(.system(size: size * 0.42, weight: .bold))
                .foregroundStyle(Ink.ink)
        }
        .frame(width: size, height: size)
        .hardShadow(Ink.redDeep, lift: 4, radius: size / 2)
    }
}

/// حقل البحث في أعلى الكتالوج.
struct SearchField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Ink.ink)
            TextField("ابحث عن لعبة", text: $text)
                .textFieldStyle(.plain)
                .font(.bodyAr(Type.body))
                .foregroundStyle(Ink.ink)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.search)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Ink.ink)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Ink.surface))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(Ink.ink, lift: 4, radius: 16)
    }
}
