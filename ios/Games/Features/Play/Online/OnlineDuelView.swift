import SwiftUI

/// مواجهة ثنائية أونلاين — مشهد `duel` (حجرة ورقة مقص، النرد، القنبلة).
///
/// الطرفان في بطاقتين متجاورتين والحكم بينهما: وضع النتيجة في سطر واحد
/// («3 - 1») يقلب ترتيب الرقمين تحت RTL، فيقرأ اللاعب فوزه خسارة.
struct OnlineDuelView: View {
    let scene: DuelScene
    let socket: GameSocket

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let round = scene.round, round.total > 0 {
                Card(padding: 14) {
                    HStack(spacing: 8) {
                        Image(systemName: "flag.fill")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(Ink.red)
                        Text("الجولة")
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink)
                        Text(onlineNumber(max(round.index, 1)))
                            .font(.bodyArBold(Type.meta))
                            .foregroundStyle(Ink.red)
                            .monospacedDigit()
                        Text("من")
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink)
                        Text(onlineNumber(round.total))
                            .font(.bodyArBold(Type.meta))
                            .foregroundStyle(Ink.ink)
                            .monospacedDigit()
                        Spacer(minLength: 0)
                    }
                }
            }

            HStack(spacing: 12) {
                OnlineDuelTile(side: scene.leadingSide, mine: isMine(scene.leadingSide))
                OnlineDuelTile(side: scene.trailingSide, mine: isMine(scene.trailingSide))
            }

            if let verdict = scene.verdict, !verdict.isEmpty {
                Text(verdict.bidiIsolated)
                    .font(.displaySoft(Type.body))
                    .foregroundStyle(Ink.cream)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Ink.redDeep)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(Ink.ink, lineWidth: 3)
                    )
                    .hardShadow(Ink.ink, lift: 5, radius: 18)
            }
        }
    }

    private func isMine(_ side: DuelSide?) -> Bool {
        guard let side, let meID = socket.meID else { return false }
        return side.player.id == meID
    }
}

/// بطاقة طرف واحد في المواجهة.
private struct OnlineDuelTile: View {
    let side: DuelSide?
    let mine: Bool

    var body: some View {
        VStack(spacing: 10) {
            OnlineAvatar(player: side?.player ?? .unknown, size: 52, ringed: mine)

            Text((side?.player.name ?? "—").bidiIsolated)
                .font(.bodyArBold(Type.meta))
                .foregroundStyle(Ink.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            Text((side?.label ?? "ينتظر").bidiIsolated)
                .font(.displaySoft(Type.body))
                .foregroundStyle(mine ? Ink.red : Ink.ink)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.5)

            if let score = side?.score {
                Text(onlineNumber(score))
                    .font(.display(Type.display))
                    .foregroundStyle(mine ? Ink.red : Ink.ink)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Ink.surface))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(mine ? Ink.redDeep : Ink.ink, lift: 5, radius: 18)
        .accessibilityElement(children: .combine)
    }
}
