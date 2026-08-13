// `webAuthenticationSession` تعيش في AuthenticationServices لا في SwiftUI،
// وبلا هذا الاستيراد يفشل البناء عند `@Environment` برسالة عن مسار مفتاح لا
// يُستنتج نوعه — وهي رسالة لا تذكر الاستيراد الناقص إطلاقًا.
import AuthenticationServices
import SwiftUI

/// شاشة الوصل: يجد الجهاز، ثم يقترن به.
///
/// ————————————————— لماذا خطوتان لا واحدة —————————————————
///
/// «أدخل الرمز» وحدها تفترض أن المستخدم يعرف أي جهاز يخاطب. وفي بيت فيه أكثر
/// من حاسب قد يجد التطبيق أكثر من خادم، فاختيار الجهاز أولًا يجعل الرمز
/// مقروءًا: هذا الجهاز، وهذا بوته، وهذا رمزه.
struct ConnectView: View {
    @Environment(Hub.self) private var hub
    @Environment(\.webAuthenticationSession) private var webAuth
    @State private var finder = Finder()

    @State private var card: Hello?
    @State private var code = ""
    @State private var manual = ""
    @State private var typingManual = false

    var body: some View {
        ScrollView {
            VStack(spacing: Metric.spaceBase) {
                header

                if let card {
                    pairing(card)
                } else {
                    picking
                }

                if let trouble = hub.trouble {
                    Text(trouble)
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.redDeep)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(Metric.spaceSm)
        }
        .background(Ink.paper)
        .onAppear { finder.start() }
        .onDisappear { finder.stop() }
    }

    // ————————————————————— الترويسة —————————————————————

    private var header: some View {
        VStack(spacing: 6) {
            Text("مِقود")
                .font(.display(46))
                .foregroundStyle(Ink.ink)
            Text("تحكّم كامل ببوت Games")
                .font(.bodyAr(Type.body))
                .foregroundStyle(Ink.ink.opacity(0.7))
        }
        .padding(.top, Metric.spaceBase)
    }

    // ————————————————————— اختيار الجهاز —————————————————————

    private var picking: some View {
        VStack(spacing: Metric.spaceSm) {
            ForEach(finder.servers) { server in
                Button { choose(server.base) } label: {
                    Card {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(server.name.bidiIsolated)
                                    .font(.bodyArBold(Type.body))
                                    .foregroundStyle(Ink.ink)
                                Text(server.base.bidiIsolated)
                                    .font(.bodyAr(Type.meta))
                                    .foregroundStyle(Ink.ink.opacity(0.6))
                            }
                            Spacer(minLength: 8)
                            Pill("وصل")
                        }
                    }
                }
                .buttonStyle(.plain)
            }

            if finder.servers.isEmpty {
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            ProgressView().tint(Ink.red)
                            Text("أدوّر على جهازك في الشبكة…")
                                .font(.bodyArBold(Type.body))
                                .foregroundStyle(Ink.ink)
                        }
                        Text("لازم البوت يكون شغّال، وجوالك على نفس الواي فاي.")
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink.opacity(0.7))
                    }
                }
            }

            manualEntry
        }
    }

    /// الباب الاحتياطي.
    ///
    /// بعض الراوترات تحجب بثّ mDNS بين الأجهزة، وشبكات الضيوف تعزل كل جهاز عن
    /// غيره. فبلا هذا الحقل يبقى المستخدم أمام شاشة تدور بلا سبب ظاهر ولا حيلة.
    private var manualEntry: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Button { typingManual.toggle() } label: {
                    HStack {
                        Text("ما ظهر؟ أدخل العنوان يدويًا")
                            .font(.bodyArBold(Type.label))
                            .foregroundStyle(Ink.ink)
                        Spacer()
                        Image(systemName: typingManual ? "chevron.up" : "chevron.down")
                            .foregroundStyle(Ink.ink.opacity(0.6))
                    }
                }
                .buttonStyle(.plain)

                if typingManual {
                    TextField("192.168.1.4:4590", text: $manual)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .font(.bodyAr(Type.body))
                        .padding(10)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Ink.cream)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(Ink.ink, lineWidth: 2)
                        )
                        .environment(\.layoutDirection, .leftToRight)

                    Button("وصل") {
                        if let ready = Address.normalize(manual) { choose(ready) }
                    }
                    .buttonStyle(BigButton(fill: Ink.ink, ink: Ink.cream))
                    .disabled(manual.isEmpty)
                }

                Text("العنوان مطبوع في نافذة تشغيل البوت على الحاسب.")
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink.opacity(0.6))
            }
        }
    }

    private func choose(_ candidate: String) {
        Task {
            hub.base = candidate
            card = await hub.hello(at: candidate)
        }
    }

    // ————————————————————— الاقتران —————————————————————

    private func pairing(_ hello: Hello) -> some View {
        VStack(spacing: Metric.spaceSm) {
            Card {
                HStack(spacing: 10) {
                    Circle()
                        .fill(hello.online ? Ink.red : Ink.ink.opacity(0.3))
                        .frame(width: 12, height: 12)
                    VStack(alignment: .leading, spacing: 2) {
                        Text((hello.bot ?? "Games").bidiIsolated)
                            .font(.bodyArBold(Type.body))
                            .foregroundStyle(Ink.ink)
                        Text(hello.online ? "متصل · \(hello.guilds) سيرفر" : "البوت غير متصل")
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink.opacity(0.65))
                    }
                    Spacer()
                }
            }

            Card {
                VStack(alignment: .leading, spacing: 12) {
                    Text("رمز الاقتران")
                        .font(.bodyArBold(Type.body))
                        .foregroundStyle(Ink.ink)

                    TextField("······", text: $code)
                        .keyboardType(.numberPad)
                        .font(.display(34))
                        .multilineTextAlignment(.center)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Ink.cream)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(Ink.ink, lineWidth: 3)
                        )
                        .onChange(of: code) { _, fresh in
                            code = String(fresh.filter(\.isNumber).prefix(6))
                        }

                    Text("ستة أرقام مطبوعة في نافذة تشغيل البوت.")
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink.opacity(0.65))

                    Button(hub.checking ? "…" : "دخول") {
                        Task { await hub.pair(code: code) }
                    }
                    .buttonStyle(BigButton(fill: Ink.red, ink: Ink.cream))
                    .disabled(code.count != 6 || hub.checking)
                }
            }

            if hello.discordLogin {
                Button("الدخول بديسكورد") { Task { await discord() } }
                    .buttonStyle(BigButton(fill: Ink.ink, ink: Ink.cream))
            }

            Button("جهاز ثاني") {
                card = nil
                code = ""
            }
            .font(.bodyAr(Type.label))
            .foregroundStyle(Ink.ink.opacity(0.6))
        }
    }

    private func discord() async {
        guard let base = hub.base, let start = URL(string: base + "/ctl/auth/start") else { return }
        do {
            // الجلسة تُغلق وحدها حين يصل المتصفّح إلى `miqwad://`، وما تحمله
            // في الاستعلام يصل هنا بلا أن يمرّ بصفحة يقرؤها المستخدم
            let back = try await webAuth.authenticate(using: start, callbackURLScheme: "miqwad")
            await hub.accept(callback: back)
        } catch {
            hub.trouble = "أُلغي الدخول بديسكورد."
        }
    }
}

/// زرّ عريض بالحدّ والظل الصلب — توقيع المشروع في شكل زر.
struct BigButton: ButtonStyle {
    let fill: Color
    let ink: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.bodyArBold(Type.body))
            .foregroundStyle(ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(fill))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Ink.ink, lineWidth: 3)
            )
            .hardShadow(Ink.ink, lift: configuration.isPressed ? 2 : 6, radius: 16)
            // الظل يقصر عند الضغط والزر ينزل معه: حركة الورقة وهي تُضغط
            .offset(x: configuration.isPressed ? 4 : 0, y: configuration.isPressed ? 4 : 0)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
