import SwiftUI

/// شاشة اللعب المنفرد: ما يمكن لعبه ضد الخصم الآلي، ومستوى صعوبته.
///
/// المستوى يُحفظ في `UserDefaults` تحت `botSkill` لا في حالة الشاشة: اللاعب
/// يضبطه مرة، ويجب أن تفتح كل شاشات اللعب على الاختيار نفسه بعد إغلاق التطبيق.
struct SoloView: View {
    @AppStorage(BotSettings.skillKey) private var skill: Skill = .normal
    @State private var path: [PlayRoute] = []

    private var games: [GameInfo] { Catalog.soloGames }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                Ink.paper.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        TopBar("اللعب المنفرد", trailing: Bots.displayName)

                        skillCard

                        VStack(alignment: .leading, spacing: 14) {
                            SectionTitle("تُلعب وحدك")
                            ForEach(games) { game in
                                GameCardButton(game: game) { open(game) }
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

    // ————— أجزاء —————

    private var skillCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                SmallHeading("مستوى الخصم")

                HStack(spacing: 10) {
                    ForEach(Skill.allCases, id: \.self) { level in
                        SkillChip(level: level, selected: level == skill) {
                            skill = level
                        }
                    }
                }

                Text(explanation)
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var explanation: String {
        switch skill {
        case .easy:   return "يخطئ كثيرًا ويتمهّل قبل أن يلعب — مناسب لأول جولة."
        case .normal: return "يوازن بين السرعة والخطأ، ويقرأ نمط لعبك أحيانًا."
        case .hard:   return "سريع وحاسم ونادرًا ما يخطئ. لا يترك لك خانة مجانية."
        }
    }

    private func open(_ game: GameInfo) {
        let route = PlayRoute.solo(game.id)
        guard path.last != route else { return }
        path.append(route)
    }
}

/// زر اختيار مستوى واحد.
private struct SkillChip: View {
    let level: Skill
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(level.title)
                .font(.bodyArBold(Type.label))
                .foregroundStyle(Ink.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(selected ? Ink.yellow : Ink.cream)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(Ink.ink, lineWidth: 3)
                )
                .hardShadow(selected ? Ink.redDeep : Ink.ink, lift: 4, radius: 14)
        }
        .buttonStyle(.plain)
    }
}
