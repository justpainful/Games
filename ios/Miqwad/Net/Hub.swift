import Foundation

/// حالة التطبيق كلّها.
///
/// ————————————————— لماذا العنوان يُحفظ والرمز في مكان آخر —————————————————
///
/// العنوان معلومة شبكة لا سرّ فيها، ويتغيّر مع الراوتر. والرمز يفتح كل مفاتيح
/// البوت. فالأول في `UserDefaults` والثاني في الـKeychain، ولا يُخلطان في
/// مخزن واحد لأن أضعف المكانين يقرّر أمانهما معًا.
@MainActor
@Observable
final class Hub {
    enum Stage: Equatable {
        /// لم نجد جهازًا بعد، أو وجدناه ولم نقترن به
        case connect
        case ready
    }

    private(set) var stage: Stage = .connect
    private(set) var who: Who?
    private(set) var status: Status?
    private(set) var checking = false
    var trouble: String?

    /// عنوان الخادم المختار. تغييره يمسح ما بُني على غيره.
    var base: String? {
        didSet {
            guard base != oldValue else { return }
            UserDefaults.standard.set(base, forKey: Self.baseKey)
            status = nil
        }
    }

    private var token: String? {
        didSet { Keychain.set(token, for: Self.tokenKey) }
    }

    private static let baseKey = "miqwad.base"
    private static let tokenKey = "session"

    init() {
        base = UserDefaults.standard.string(forKey: Self.baseKey)
        token = Keychain.get(Self.tokenKey)
    }

    private var control: Control? {
        guard let base else { return nil }
        return Control(base: base + "/ctl", token: token)
    }

    // ————————————————————— الدخول —————————————————————

    /// بطاقة تعريف الخادم قبل أي اقتران — تُظهر اسم البوت فيعرف أنه جهازه.
    func hello(at candidate: String) async -> Hello? {
        do {
            return try await Control(base: candidate + "/ctl", token: nil).get("/hello")
        } catch {
            trouble = (error as? Control.Failure)?.errorDescription ?? "ما وصلت للجهاز."
            return nil
        }
    }

    func pair(code: String) async {
        guard let base else { return }
        checking = true
        defer { checking = false }

        do {
            let reply: PairReply = try await Control(base: base + "/ctl", token: nil)
                .post("/pair", ["code": code])
            token = reply.token
            who = reply.user
            stage = .ready
            trouble = nil
            await refresh()
        } catch {
            trouble = (error as? Control.Failure)?.errorDescription ?? "تعذّر الاقتران."
        }
    }

    /// يستقبل ما عاد به `miqwad://auth?token=…` بعد دخول ديسكورد.
    func accept(callback url: URL) async {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let why = items.first(where: { $0.name == "error" })?.value {
            trouble = why
            return
        }
        guard let handed = items.first(where: { $0.name == "token" })?.value else {
            trouble = "ما وصل رمز من ديسكورد."
            return
        }
        token = handed
        await restore()
    }

    /// جلسة محفوظة من تشغيل سابق: تُجرَّب بلا أن يُسأل المستخدم شيئًا.
    func restore() async {
        guard let control, token != nil else { return }
        checking = true
        defer { checking = false }

        do {
            struct Mine: Decodable { let user: Who }
            let mine: Mine = try await control.get("/me")
            who = mine.user
            stage = .ready
            trouble = nil
            await refresh()
        } catch Control.Failure.unauthorized {
            // رمز منتهٍ أو سرّ تبدّل على الخادم: نمسحه بدل أن نعلق في 401 كل مرّة
            token = nil
            stage = .connect
        } catch {
            // الجهاز مطفأ أو خارج الشبكة: الجلسة تبقى، والشاشة تقول ما جرى
            trouble = (error as? Control.Failure)?.errorDescription ?? "ما وصلت للجهاز."
            stage = .connect
        }
    }

    func signOut() {
        token = nil
        who = nil
        status = nil
        stage = .connect
    }

    // ————————————————————— الحالة —————————————————————

    func refresh() async {
        guard let control else { return }
        do {
            status = try await control.get("/status")
            trouble = nil
        } catch Control.Failure.unauthorized {
            token = nil
            stage = .connect
        } catch {
            trouble = (error as? Control.Failure)?.errorDescription ?? "تعذّر التحديث."
        }
    }

    // ————————————————————— السيرفرات —————————————————————

    private(set) var guilds: [GuildBrief] = []
    private(set) var opened: GuildView?
    private(set) var saying: String?

    func loadGuilds() async {
        guard let control else { return }
        do {
            guilds = try await control.get("/guilds")
            trouble = nil
        } catch {
            trouble = (error as? Control.Failure)?.errorDescription ?? "تعذّر قراءة السيرفرات."
        }
    }

    func open(_ guildId: String) async {
        guard let control else { return }
        checking = true
        defer { checking = false }
        do {
            opened = try await control.get("/guild/\(guildId)")
            trouble = nil
        } catch {
            trouble = (error as? Control.Failure)?.errorDescription ?? "تعذّر فتح السيرفر."
        }
    }

    /**
     * يطبّق تعديلًا ويستبدل الحالة كلّها بما عاد به الخادم.
     *
     * لا تعديل متفائل هنا: قلبُ زرّ قبل وصول الردّ يعرض ما ظنّه التطبيق لا ما
     * صار فعلًا، ويبقى الفرق خفيًّا حتى يُغلق التطبيق ويُفتح. والطلب على
     * الشبكة المحلية بمللي ثوانٍ، فما يشتريه التفاؤل هنا لا يُرى.
     */
    func change(_ change: Change) async {
        guard let control, let guildId = opened?.guild.id else { return }
        checking = true
        defer { checking = false }
        do {
            let applied: Applied = try await control.post("/guild/\(guildId)", change)
            if let fresh = applied.guild { opened = fresh }
            saying = applied.said
            trouble = nil
        } catch {
            trouble = (error as? Control.Failure)?.errorDescription ?? "ما انحفظ التعديل."
        }
    }
}
