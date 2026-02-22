function doPost(e) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]; // 첫 번째 시트를 명시적으로 사용
    var data = JSON.parse(e.postData.contents);
    var date = data.date; // "YYYY-MM-DD"

    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["날짜", "데이터 내용(JSON)"]);
    }

    var values = sheet.getDataRange().getValues();
    var rowToUpdate = -1;
    var targetNumeric = date.replace(/[^0-9]/g, ""); // "20260222"

    for (var i = 1; i < values.length; i++) {
        if (getNumericDate(values[i][0]) === targetNumeric) {
            rowToUpdate = i + 1;
            break;
        }
    }

    if (rowToUpdate != -1) {
        sheet.getRange(rowToUpdate, 1, 1, 2).setValues([[date, JSON.stringify(data)]]);
    } else {
        sheet.appendRow([date, JSON.stringify(data)]);
    }

    return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var date = e.parameter.date;
    var targetNumeric = date.replace(/[^0-9]/g, "");

    if (sheet.getLastRow() === 0) {
        return ContentService.createTextOutput(JSON.stringify({ result: "not_found" })).setMimeType(ContentService.MimeType.JSON);
    }

    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
        if (getNumericDate(values[i][0]) === targetNumeric) {
            return ContentService.createTextOutput(values[i][1]).setMimeType(ContentService.MimeType.JSON);
        }
    }

    return ContentService.createTextOutput(JSON.stringify({ result: "not_found" })).setMimeType(ContentService.MimeType.JSON);
}

// 어떤 형식이든 숫자만 추출 (2026-02-22 -> 20260222, 2026. 2. 22 -> 20260222)
function getNumericDate(cellValue) {
    if (!cellValue) return "";

    if (cellValue instanceof Date) {
        // 날짜 객체면 안전하게 포맷팅 후 숫자만 추출
        return Utilities.formatDate(cellValue, "GMT+9", "yyyyMMdd");
    }

    // 문자열이면 모든 기호 제거하고 숫자만
    return String(cellValue).replace(/[^0-9]/g, "");
}
