import Foundation
import Observation

/// حالة التطبيق المشتركة.
///
/// مصدر واحد للحساب والنقاط: كل شاشة تقرأ منه بدل أن تجلب لنفسها، وإلا ظهر
/// رصيد نقاط مختلف في البروفايل عنه في الصدارة بعد أول لعبة.
@Observable
@MainActor
public final class AppState {
    public enum Phase { case loading, signedOut, signedIn }

    public private(set) var phase: Phase = .loading
    public private(set) var account: Account?
    public private(set) var points: Points = .empty
    public private(set) var guilds: [Guild] = []
    /// السيرفر المختار — النقاط مفصولة لكل سيرفر، فلا معنى لعرضها بلا اختياره.
    public var activeGuildID: String? {
        didSet { UserDefaults.standard.set(activeGuildID, forKey: "activeGuild") }
    }

    public var lastError: String?

    private let api = API.shared

    /// وضع العرض: بيانات ثابتة بلا خادم ولا تسجيل دخول.
    ///
    /// ضروري لأمرين: التقاط لقطات كل الشاشات في CI (البناء يجري على ماك بلا
    /// خادم ولا حساب ديسكورد)، وعرض التطبيق دون انتظار تشغيل الخلفية.
    /// يُفعَّل بوسيط الإقلاع `-demo` فقط، فلا يمكن الوصول إليه من التطبيق المنشور.
    public static var isDemo: Bool { Demo.isOn }

    public init() {
        activeGuildID = UserDefaults.standard.string(forKey: "activeGuild")
    }

    /// يستعيد الجلسة عند الإقلاع من الـ Keychain.
    public func restore() async {
        if Self.isDemo {
            loadDemo()
            return
        }
        guard Session.shared.token != nil else {
            phase = .signedOut
            return
        }
        do {
            try await refresh()
            phase = .signedIn
        } catch {
            // رمز منتهٍ أو ملغى — يُمسح بدل أن يعلق المستخدم في شاشة تحميل
            Session.shared.clear()
            phase = .signedOut
        }
    }

    public func signIn() async {
        do {
            let token = try await Auth.signInWithDiscord()
            Session.shared.token = token
            try await refresh()
            phase = .signedIn
            lastError = nil
        } catch Auth.Failure.cancelled {
            // إلغاء المستخدم ليس خطأ — لا رسالة
        } catch {
            lastError = "تعذّر تسجيل الدخول. تأكد من اتصالك وحاول مرة أخرى."
        }
    }

    public func signOut() {
        Session.shared.clear()
        account = nil
        points = .empty
        guilds = []
        phase = .signedOut
    }

    public func refresh() async throws {
        let me: MeResponse = try await api.get("/me")
        account = me.account
        guilds = me.guilds
        if activeGuildID == nil || !me.guilds.contains(where: { $0.id == activeGuildID }) {
            activeGuildID = me.guilds.first?.id
        }
        try await refreshPoints()
    }

    public func refreshPoints() async throws {
        if Self.isDemo { return }
        guard let guildID = activeGuildID else {
            points = .empty
            return
        }
        points = try await api.get("/points/\(guildID)")
    }

    /// بيانات العرض. أسماء متنوّعة عمدًا — عربي طويل ولاتيني بنقطة بادئة —
    /// فتكشف اللقطة كسر الاتجاه والقصّ بدل أن تخفيه بأسماء قصيرة مثالية.
    private func loadDemo() {
        account = Demo.account
        points = Demo.points
        guilds = Demo.guilds
        activeGuildID = Demo.guilds.first?.id
        phase = .signedIn
    }
}

public struct MeResponse: Codable, Sendable {
    public let account: Account
    public let guilds: [Guild]
}
