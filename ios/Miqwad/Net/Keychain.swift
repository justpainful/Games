import Foundation
import Security

/// حفظ رمز الجلسة في الـKeychain.
///
/// لا في `UserDefaults`: ذاك ملف plist عادي داخل الحاوية، ونسخة احتياطية غير
/// مشفّرة للجهاز تخرجه كما هو. والرمز هنا يفتح كل مفاتيح البوت، فمكانه المخزن
/// المشفّر لا ملف تفضيلات.
enum Keychain {
    private static let service = "com.justpainful.miqwad"

    static func set(_ value: String?, for key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)

        guard let value, let data = value.data(using: .utf8) else { return }
        var insert = query
        insert[kSecValueData as String] = data
        // بعد أول فتح لا دائمًا: التطبيق يحدّث الحالة في الخلفية، وقفل
        // `WhenUnlocked` يمنعه من قراءة الرمز والجوال في الجيب
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(insert as CFDictionary, nil)
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
