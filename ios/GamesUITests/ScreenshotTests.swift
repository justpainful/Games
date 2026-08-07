import XCTest

/// يلتقط لقطة لكل شاشة ويحفظها كمرفق في نتيجة الاختبار.
///
/// هذه هي العين الوحيدة على التطبيق: التطوير يجري على ويندوز بلا Xcode، فلا
/// طريقة لرؤية الواجهة إلا هذه اللقطات. لذلك يلتقط كل تبويب، ويتحقق أيضًا من
/// أن المحتوى داخل حدود الشاشة — القصّ من أعلى أو أسفل عيب لا يظهر في البناء.
final class ScreenshotTests: XCTestCase {

    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        // وضع العرض: بيانات ثابتة بلا خادم ولا تسجيل دخول
        app.launchArguments = ["-demo"]
        app.launch()
    }

    func testCaptureAllTabs() throws {
        // الشاشة الأولى تحتاج مهلة أطول: تحميل الخطوط ورسم أول إطار
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
        sleep(3)

        shoot("01-catalog")

        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 10), "شريط التنقّل لم يظهر")

        // الترتيب هنا يطابق RootTabView. الأسماء عربية لأن الواجهة عربية.
        let names = ["منفرد", "الصدارة", "حسابي"]
        for (index, name) in names.enumerated() {
            let button = tabs.buttons[name]
            guard button.waitForExistence(timeout: 6) else {
                XCTFail("لا يوجد تبويب باسم \(name)")
                continue
            }
            button.tap()
            sleep(2)
            shoot(String(format: "%02d-%@", index + 2, name))
        }
    }

    /// يتحقق أن أطراف المحتوى داخل الشاشة — الشرط الذي طُلب صراحةً.
    func testContentIsNotClipped() throws {
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
        sleep(3)

        let screen = app.frame
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 10))

        // شريط التنقّل يجب أن يكون كاملًا داخل الشاشة لا نصفه تحت الحافة
        XCTAssertGreaterThanOrEqual(tabs.frame.minY, screen.minY, "شريط التنقّل مقصوص من أعلى")
        XCTAssertLessThanOrEqual(tabs.frame.maxY, screen.maxY + 1, "شريط التنقّل مقصوص من أسفل")

        // أي نص ظاهر يجب أن يقع داخل حدود الشاشة رأسيًا
        for element in app.staticTexts.allElementsBoundByIndex.prefix(25) where element.exists {
            let f = element.frame
            guard f.height > 0, f.width > 0 else { continue }
            XCTAssertGreaterThanOrEqual(
                f.minY, screen.minY - 1,
                "نص خارج الشاشة من أعلى: \(element.label)"
            )
            XCTAssertLessThanOrEqual(
                f.maxY, screen.maxY + 1,
                "نص خارج الشاشة من أسفل: \(element.label)"
            )
        }

        shoot("clip-check")
    }

    private func shoot(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
