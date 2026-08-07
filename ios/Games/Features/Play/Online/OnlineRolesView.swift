import SwiftUI

/// طور لعبة أدوار أونلاين — مشهد `roles` (المافيا).
///
/// دور اللاعب يصل همسًا (`whisper`) لا في المشهد، لأن المشهد يراه الجميع.
/// الهمس يُعرض في بطاقته الحمراء في `OnlineGameView`، وهذه الشاشة للطور العام.
struct OnlineRolesView: View {
    let scene: RolesScene
    let socket: GameSocket

    private var phaseTitle: String {
        switch scene.phase {
        case "night": return "الليل"
        case "result": return "النتيجة"
        default: return "النهار"
        }
    }

    private var phaseSymbol: String {
        switch scene.phase {
        case "night": return "moon.stars.fill"
        case "result": return "flag.checkered"
        default: return "sun.max.fill"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Card(shadow: scene.phase == "night" ? Ink.ink : Ink.redDeep) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: phaseSymbol)
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(Ink.red)
                        Text(phaseTitle)
                            .font(.displaySoft(Type.body))
                            .foregroundStyle(Ink.ink)
                        Spacer(minLength: 8)
                        Pill("\(onlineNumber(scene.alive.count)) على قيد الحياة")
                    }

                    Text(scene.headline.bidiIsolated)
                        .font(.display(Type.title))
                        .foregroundStyle(Ink.red)
                        .lineSpacing(Type.lineSpacing)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .minimumScaleFactor(0.6)
                        .fixedSize(horizontal: false, vertical: true)

                    if let detail = scene.detail, !detail.isEmpty {
                        Text(detail.bidiIsolated)
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                            .lineSpacing(Type.lineSpacing)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            if let spotlight = scene.spotlight {
                Card(shadow: Ink.redDeep, padding: 14) {
                    HStack(spacing: 12) {
                        OnlineAvatar(player: spotlight, size: 48, ringed: true)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("في دائرة الضوء")
                                .font(.bodyAr(Type.meta))
                                .foregroundStyle(Ink.ink)
                            Text(spotlight.name.bidiIsolated)
                                .font(.displaySoft(Type.body))
                                .foregroundStyle(Ink.red)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }

            Card {
                VStack(alignment: .leading, spacing: 12) {
                    SmallHeading("الأحياء")
                    if scene.alive.isEmpty {
                        Text("لم يبقَ أحد.")
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                    } else {
                        OnlineRoster(players: scene.alive, hostID: nil, meID: socket.meID)
                    }
                }
            }

            if !scene.dead.isEmpty {
                Card {
                    VStack(alignment: .leading, spacing: 12) {
                        SmallHeading("خرجوا")
                        OnlineRoster(
                            players: scene.dead,
                            hostID: nil,
                            meID: nil,
                            dimmedIDs: Set(scene.dead.map(\.id))
                        )
                    }
                }
            }
        }
    }
}
