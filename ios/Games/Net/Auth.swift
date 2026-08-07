import AuthenticationServices
import Foundation
import Security
import UIKit

/// تخزين رمز الجلسة في الـ Keychain.
///
/// ليس `UserDefaults`: رمز الجلسة يعادل كلمة المرور، و`UserDefaults` ملف
/// نصّي يخرج مع أي نسخة احتياطية غير مشفّرة.
/// ليس `actor` عمدًا: واجهة الـ Keychain نفسها آمنة للخيوط، فالعزل هنا لا يضيف
/// أمانًا بل يفرض `await` على كل قراءة — بما فيها القراءة المتزامنة عند الإقلاع
/// وعند بناء كل طلب HTTP.
public final class Session: @unchecked Sendable {
    public static let shared = Session()
    private let key = "session.token"
    private let lock = NSLock()

    public var token: String? {
        get {
            lock.lock(); defer { lock.unlock() }
            return read()
        }
        set {
            lock.lock(); defer { lock.unlock() }
            if let newValue { write(newValue) } else { deleteAll() }
        }
    }

    public func clear() {
        token = nil
    }

    private func query(_ extra: [String: Any] = [:]) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.justpainful.games",
            kSecAttrAccount as String: key,
        ]
        extra.forEach { q[$0.key] = $0.value }
        return q
    }

    private func read() -> String? {
        var out: AnyObject?
        let status = SecItemCopyMatching(
            query([kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]) as CFDictionary,
            &out
        )
        guard status == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func write(_ value: String) {
        deleteAll()
        let attrs = query([
            kSecValueData as String: Data(value.utf8),
            // الرمز لا يُقرأ إلا بعد فتح الجهاز أول مرة، ولا يخرج في النسخ الاحتياطي
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ])
        SecItemAdd(attrs as CFDictionary, nil)
    }

    private func deleteAll() {
        SecItemDelete(query() as CFDictionary)
    }
}

/// تسجيل الدخول بديسكورد.
///
/// التبادل يجري على الخادم لا في التطبيق: `client_secret` لا يوضع في تطبيق
/// يُوزَّع على الأجهزة — استخراجه من الحزمة عملية دقائق. التطبيق يفتح صفحة
/// الخادم، والخادم يتولى ديسكورد ويعيد رمز جلسة خاصًا بنا.
public enum Auth {
    public enum Failure: Error { case cancelled, badCallback, noToken }

    public static let callbackScheme = "gamesapp"

    @MainActor
    public static func signInWithDiscord() async throws -> String {
        let start = Backend.baseURL
            .appendingPathComponent("auth/start")
            .appending(queryItems: [URLQueryItem(name: "redirect", value: "\(callbackScheme)://auth")])

        let callback: URL = try await withCheckedThrowingContinuation { cont in
            let session = ASWebAuthenticationSession(
                url: start,
                callbackURLScheme: callbackScheme
            ) { url, error in
                if let error {
                    let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                    cont.resume(throwing: cancelled ? Failure.cancelled : error)
                    return
                }
                guard let url else { return cont.resume(throwing: Failure.badCallback) }
                cont.resume(returning: url)
            }
            session.presentationContextProvider = Presenter.shared
            // جلسة خاصة: لا يبقى المستخدم مسجَّلًا في سفاري بعد الخروج
            session.prefersEphemeralWebBrowserSession = true
            session.start()
        }

        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems
        guard let token = items?.first(where: { $0.name == "token" })?.value, !token.isEmpty else {
            throw Failure.noToken
        }
        return token
    }
}

@MainActor
private final class Presenter: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = Presenter()
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene
        return scene?.keyWindow ?? ASPresentationAnchor()
    }
}
