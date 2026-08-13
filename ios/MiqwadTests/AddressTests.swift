import XCTest
@testable import Miqwad

/// اختبارات الباب الاحتياطي: ما يكتبه المستخدم في حقل العنوان.
///
/// هذا الحقل هو ما يبقى حين يحجب الراوتر بثّ mDNS، فسقوطه يعني تطبيقًا لا
/// يتصل بشيء على شبكة كاملة. وصيَغ الإدخال تُختبر هنا لأنها الشيء الوحيد في
/// مسار الوصل الذي يمكن التحقق منه بلا خادم ولا شبكة.
final class AddressTests: XCTestCase {

    func testBareAddressGetsDefaultPort() {
        XCTAssertEqual(Address.normalize("192.168.1.4"), "http://192.168.1.4:4590")
    }

    func testExplicitPortIsKept() {
        XCTAssertEqual(Address.normalize("192.168.1.4:9000"), "http://192.168.1.4:9000")
    }

    func testSchemeAndTrailingPathAreStripped() {
        // ما يُنسخ من الطرفيّة يأتي بالمخطّط وأحيانًا بشرطة في آخره
        XCTAssertEqual(Address.normalize("http://192.168.1.4:4590/"), "http://192.168.1.4:4590")
        XCTAssertEqual(Address.normalize("https://10.0.0.9"), "http://10.0.0.9:4590")
    }

    func testWhitespaceAndEmptyInput() {
        XCTAssertEqual(Address.normalize("  192.168.1.4  "), "http://192.168.1.4:4590")
        XCTAssertNil(Address.normalize("   "))
        XCTAssertNil(Address.normalize(""))
    }

    func testHostnameWorksToo() {
        XCTAssertEqual(Address.normalize("kuroi-pc.local"), "http://kuroi-pc.local:4590")
    }

    /// النقطتان في IPv6 ليستا منفذًا — بلا القوسين يصير `fe80::1` عنوانًا
    /// بمنفذ `:1` ويسقط الوصل بلا رسالة مفهومة.
    func testIPv6NeedsBrackets() {
        XCTAssertEqual(Address.normalize("[fe80::1]"), "http://[fe80::1]:4590")
        XCTAssertEqual(Address.normalize("[fe80::1]:4590"), "http://[fe80::1]:4590")
    }

    func testDurationSpelling() {
        XCTAssertEqual(spell(45), "45 ثانية")
        XCTAssertEqual(spell(90), "1 دقيقة")
        XCTAssertEqual(spell(3_600 * 5), "5 ساعة")
        XCTAssertEqual(spell(3_600 * 24 * 3), "3 يوم")
    }
}
