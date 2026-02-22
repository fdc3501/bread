function doPost(e) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    var date = data.date; // "YYYY-MM-DD"

    if (sheet.getLastRow() === 0) {
        sheet.appendRow(["날짜", "데이터 내용(JSON)"]);
    }

    var values = sheet.getDataRange().getValues();
    var rowToUpdate = -1;

    for (var i = 1; i < values.length; i++) {
        if (matchDate(values[i][0], date)) {
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
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var date = e.parameter.date;

    if (sheet.getLastRow() === 0) {
        return ContentService.createTextOutput(JSON.stringify({ result: "not_found" })).setMimeType(ContentService.MimeType.JSON);
    }

    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
        if (matchDate(values[i][0], date)) {
            return ContentService.createTextOutput(values[i][1]).setMimeType(ContentService.MimeType.JSON);
        }
    }

    return ContentService.createTextOutput(JSON.stringify({ result: "not_found" })).setMimeType(ContentService.MimeType.JSON);
}

// 찰떡같이 날짜를 찾아내는 함수
function matchDate(cellValue, targetDateStr) {
    if (!cellValue) return false;

    // 1. 단순 문자열 비교
    var cellStr = String(cellValue);
    if (cellStr.indexOf(targetDateStr) !== -1) return true;

    // 2. 날짜 객체인 경우 (한국 시간 GMT+9 기준으로 변환해서 비교)
    if (cellValue instanceof Date) {
        try {
            var formatted = Utilities.formatDate(cellValue, "GMT+9", "yyyy-MM-dd");
            if (formatted === targetDateStr) return true;
        } catch (e) { }
    }

    return false;
}
