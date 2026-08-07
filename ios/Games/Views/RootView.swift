import SwiftUI

/// شاشة M0 — غرضها إثبات حلقة التحقق لا أكثر.
///
/// تعرض عمدًا كل ما يمكن أن ينكسر مبكرًا: وصل الحروف العربية، اتجاه RTL،
/// تحميل الخطوط من الحزمة، الظل الصلب الملوّن، واحترام المنطقة الآمنة أعلى
/// وأسفل. لو ظهرت هذه صحيحة في لقطة الـ CI فالبقية بناء لا مخاطرة.
struct RootView: View {
    var body: some View {
        ZStack {
            Ink.paper.ignoresSafeArea()

            VStack(spacing: 16) {
                // علامة الحافة العليا: لو انقصّت الشاشة من فوق تختفي
                EdgeMarker(text: "أعلى الشاشة")

                TopBar("نقاطي", trailing: "٦ نقاط")

                Card(shadow: Ink.redDeep) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("عبدالرحمن")
                            .font(.display(Type.display))
                            .foregroundStyle(Ink.red)
                        Text("لعبة ثنائية ممتعة، يمكنك لعبها مع الأصدقاء")
                            .font(.bodyAr())
                            .foregroundStyle(Ink.ink.opacity(0.62))
                            .lineSpacing(Type.lineSpacing)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                HStack(spacing: 10) {
                    WalletTile(label: "روليت", value: 1)
                    WalletTile(label: "جماعية", value: 2)
                    WalletTile(label: "فردية", value: 3)
                }

                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("«فحص الاتجاه»")
                            .font(.displaySoft(Type.title))
                            .foregroundStyle(Ink.ink)

                        // مقارنة محكومة تحسم التقنية للتطبيق كله: نفس الاسم
                        // ".zja6" مرّتين، الفرق الوحيد هو العزل. الصحيح أن تبقى
                        // النقطة ملاصقة لحرف z لا أن تقفز لطرف المقطع.
                        Text("بلا عزل:  اسم .zja6 هنا")
                            .font(.bodyAr())
                            .foregroundStyle(Ink.red)
                        Text("مع عزل:  اسم \(".zja6".bidiIsolated) هنا")
                            .font(.bodyAr())
                            .foregroundStyle(Ink.ink)
                    }
                }

                Spacer(minLength: 0)

                Text("بدء اللعبة")
                    .font(.displaySoft(Type.body))
                    .foregroundStyle(Ink.ink)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Ink.yellow))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(Ink.ink, lineWidth: 3)
                    )
                    // أصفر بظل أحمر: اندماج لوني الهوية (DESIGN.md §5)
                    .hardShadow(Ink.redDeep, lift: 5, radius: 12)

                // علامة الحافة السفلى: لو انقصّت الشاشة من تحت تختفي
                EdgeMarker(text: "أسفل الشاشة")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }
}

/// شريط رفيع عند الحافة — وجوده في اللقطة يثبت أن الشاشة كاملة.
private struct EdgeMarker: View {
    let text: String
    var body: some View {
        HStack(spacing: 6) {
            Rectangle().fill(Ink.ink).frame(height: 2)
            Text(text)
                .font(.bodyAr(Type.meta))
                .foregroundStyle(Ink.ink.opacity(0.55))
                .fixedSize()
            Rectangle().fill(Ink.ink).frame(height: 2)
        }
    }
}

private struct WalletTile: View {
    let label: String
    let value: Int

    var body: some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.display(28))
                .foregroundStyle(Ink.ink)
            Text(label)
                .font(.bodyAr(Type.meta))
                .foregroundStyle(Ink.ink.opacity(0.62))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Ink.surface))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(Ink.ink, lift: 4, radius: 14)
    }
}

#Preview {
    RootView().environment(\.layoutDirection, .rightToLeft)
}
