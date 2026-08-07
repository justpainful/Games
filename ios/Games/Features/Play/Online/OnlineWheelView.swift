import SwiftUI

/// عجلة الاختيار أونلاين — مشهد `wheel` (الروليت).
///
/// لا عجلة دوّارة: المشهد يصل محسومًا من الخادم، ورسم دوران يستمر بعد وصول
/// النتيجة يعد بتشويق لا يملكه ويؤخّر الخبر. المختار يُبرز بقرص أصفر بظل أحمر —
/// نفس توقيع الفوز في بقية الشاشات.
struct OnlineWheelView: View {
    let scene: WheelScene
    let socket: GameSocket

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            pickedCard

            Card {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        SmallHeading("في العجلة")
                        Spacer(minLength: 8)
                        Pill("\(onlineNumber(scene.players.count)) لاعبًا")
                    }
                    if scene.players.isEmpty {
                        Text("لا لاعبين في العجلة بعد.")
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                    } else {
                        OnlineRoster(
                            players: scene.players,
                            hostID: scene.picked?.id,
                            meID: socket.meID
                        )
                    }
                }
            }
        }
    }

    private var pickedCard: some View {
        Card(shadow: scene.picked == nil ? Ink.ink : Ink.redDeep) {
            VStack(spacing: 14) {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(Ink.red)

                if let picked = scene.picked {
                    OnlineAvatar(player: picked, size: 74, ringed: true)
                    Text(picked.name.bidiIsolated)
                        .font(.display(Type.title))
                        .foregroundStyle(Ink.red)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .minimumScaleFactor(0.5)
                } else {
                    Text("العجلة تدور…")
                        .font(.displaySoft(Type.title))
                        .foregroundStyle(Ink.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }

                if let note = scene.note, !note.isEmpty {
                    Text(note.bidiIsolated)
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink)
                        .lineSpacing(Type.lineSpacing)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
}
