import SwiftUI

/// مقاس النص على الجوال.
///
/// **لا يُولَّد** من `tokens.ts` عمدًا: مقاسات الكانفاس محسوبة لعرض 1500px،
/// والشاشة نحو 390pt. التحويل النسبي كان يعطي عنوانًا بحجم 21pt — أي وسطًا
/// لا هو عنوان ولا نص. المقاس هنا قرار مستقل لوسيط مختلف، واللون والشكل
/// وحدهما يأتيان من المصدر المشترك.
public enum Type {
    public static let display: CGFloat = 34
    public static let title: CGFloat = 22
    public static let body: CGFloat = 17
    public static let label: CGFloat = 15
    public static let meta: CGFloat = 13

    /// العربية تحتاج مساحة رأسية أكبر — DESIGN.md §4 لا ينزل تحت 1.7
    public static let lineSpacing: CGFloat = 6
}

public extension Font {
    static func display(_ size: CGFloat = Type.display) -> Font {
        .custom(Face.display, size: size)
    }
    static func displaySoft(_ size: CGFloat = Type.title) -> Font {
        .custom(Face.displaySoft, size: size)
    }
    static func bodyAr(_ size: CGFloat = Type.body) -> Font {
        .custom(Face.body, size: size)
    }
    static func bodyArBold(_ size: CGFloat = Type.label) -> Font {
        .custom(Face.bodyBold, size: size)
    }
}

public extension String {
    /// عزل ثنائي الاتجاه — مكافئ `<bdi>` على الويب.
    ///
    /// أسماء ديسكورد لاتينية غالبًا وتبدأ أو تنتهي بمحارف محايدة (`.` `_` أرقام).
    /// داخل نص عربي تنتقل تلك المحارف للطرف الخطأ فيصير ".zja6" معروضًا "zja6."
    /// — وهو خطأ ظهر فعلًا في أول لقطة CI. الحلّ محرفا FSI/PDI حول النص.
    var bidiIsolated: String { "\u{2068}\(self)\u{2069}" }
}

/// الظل الصلب — توقيع المشروع (DESIGN.md §5).
///
/// `shadow()` في SwiftUI ضبابي دائمًا ولا يمكن جعله صلبًا، فالتنفيذ نسخة ثانية
/// من الشكل نفسه مزاحة خلفه. ولون الظل متغيّر: الأصفر يُلقي ظلًا أحمر، وهو
/// موضع اندماج لوني الهوية.
public struct HardShadow: ViewModifier {
    let color: Color
    let lift: CGFloat
    let radius: CGFloat

    public func body(content: Content) -> some View {
        content.background(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(color)
                // الهدف يسار-أسفل كما في الويب (DESIGN.md §5). القيمة موجبة لأن
                // SwiftUI يعكس `offset` أفقيًا تحت layoutDirection = RTL —
                // ثبت ذلك من أول لقطة CI حين خرج الظل يمينًا بقيمة سالبة.
                .offset(x: lift, y: lift)
        )
    }
}

public extension View {
    func hardShadow(_ color: Color = Ink.ink, lift: CGFloat = 6, radius: CGFloat = 18) -> some View {
        modifier(HardShadow(color: color, lift: lift, radius: radius))
    }
}

/// بطاقة القصاصة المقصوصة: سطح كريمي + حد أسود سميك + ظل صلب.
public struct Card<Content: View>: View {
    var shadow: Color = Ink.ink
    var padding: CGFloat = 18
    @ViewBuilder var content: () -> Content

    public init(shadow: Color = Ink.ink, padding: CGFloat = 18, @ViewBuilder content: @escaping () -> Content) {
        self.shadow = shadow
        self.padding = padding
        self.content = content
    }

    public var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Ink.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Ink.ink, lineWidth: 3)
            )
            .hardShadow(shadow, lift: 6, radius: 18)
    }
}

/// كبسولة صغيرة — العدّادات وأسماء المحافظ.
public struct Pill: View {
    let text: String
    var fill: Color = Ink.yellow
    var textColor: Color = Ink.ink

    public init(_ text: String, fill: Color = Ink.yellow, textColor: Color = Ink.ink) {
        self.text = text
        self.fill = fill
        self.textColor = textColor
    }

    public var body: some View {
        Text(text)
            .font(.bodyArBold(Type.meta))
            .foregroundStyle(textColor)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(Capsule().fill(fill))
            .overlay(Capsule().strokeBorder(Ink.ink, lineWidth: 2))
    }
}

// ————— Liquid Glass —————
//
// قرار مقصود: الزجاج لا يُطبَّق على البطاقات.
//
// هوية المشروع مسطّحة بحدّ أسود وظل صلب (DESIGN.md §5)، والزجاج شفاف وضبابي —
// وضعه على البطاقات يمحو التوقيع ويحوّل التطبيق إلى تطبيق iOS عام. لذلك
// الزجاج يخدم **طبقة النظام** وحدها: شريط التنقّل، العناصر الطافية، والطبقات
// المؤقتة فوق المحتوى. المحتوى نفسه يبقى قصاصات ورقية.

// لا بدائل ولا `#available`: الحد الأدنى للمشروع iOS 26، فـ `glassEffect` متاح
// دائمًا. المواد الضبابية القديمة (عائلة Material كلها) **ممنوعة منعًا باتًا** —
// هي تقريب قديم للزجاج، ووجود أيّ منها يعني سطحين بمظهرين مختلفين في التطبيق
// نفسه. الـ CI يفشل البناء إن ظهرت أيّ منها في أي ملف.

public extension View {
    /// سطح زجاجي — للكروم والعناصر الطافية.
    @ViewBuilder
    func glassSurface(cornerRadius: CGFloat = 20, interactive: Bool = false) -> some View {
        if interactive {
            glassEffect(.regular.interactive(), in: .rect(cornerRadius: cornerRadius))
        } else {
            glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
        }
    }

    /// سطح زجاجي مصبوغ بلون الهوية — لعنصر طافٍ يجب أن يُرى فوق أي خلفية.
    func glassTinted(_ tint: Color, cornerRadius: CGFloat = 20) -> some View {
        glassEffect(.regular.tint(tint.opacity(0.55)).interactive(),
                    in: .rect(cornerRadius: cornerRadius))
    }
}

/// الشريط الأحمر العلوي — عنوان الشاشة.
public struct TopBar: View {
    let title: String
    var trailing: String?

    public init(_ title: String, trailing: String? = nil) {
        self.title = title
        self.trailing = trailing
    }

    public var body: some View {
        HStack {
            Text(title)
                .font(.displaySoft(Type.title))
                .foregroundStyle(Ink.cream)
            Spacer(minLength: 12)
            if let trailing { Pill(trailing) }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Ink.red))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(Ink.ink, lift: 5, radius: 14)
    }
}
