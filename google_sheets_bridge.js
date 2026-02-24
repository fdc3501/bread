function doPost(e) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheets()[0];
        var data = JSON.parse(e.postData.contents);
        var date = data.date;

        if (!date) throw new Error("데이터에 날짜(date) 항목이 없습니다.");

        if (sheet.getLastRow() === 0) {
            sheet.appendRow(["날짜", "데이터 내용(JSON)"]);
        }

        var values = sheet.getDataRange().getValues();
        var targetNumeric = getNumericDate(date);
        var rowToUpdate = -1;

        for (var i = 1; i < values.length; i++) {
            if (getNumericDate(values[i][0]) === targetNumeric) {
                rowToUpdate = i + 1;
                break;
            }
        }

        // status가 'deleted'이면 해당 행을 삭제
        if (data.status === 'deleted') {
            if (rowToUpdate !== -1) {
                sheet.deleteRow(rowToUpdate);
            }
            return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "삭제됨" })).setMimeType(ContentService.MimeType.JSON);
        }

        if (rowToUpdate != -1) {
            // 이미 최종확정(finalized)된 데이터를 미확정(draft) 데이터로 덮어쓰는 것을 방지
            // (아르바이트 재저장 등이 사장의 확정 내역을 지우는 사고 예방)
            try {
                var existingData = JSON.parse(values[rowToUpdate - 1][1] || '{}');
                if (existingData.status === 'finalized' && data.status !== 'finalized') {
                    return ContentService.createTextOutput(JSON.stringify({
                        result: "error",
                        message: "이미 최종확정된 데이터입니다. 미확정 상태로 덮어쓸 수 없습니다."
                    })).setMimeType(ContentService.MimeType.JSON);
                }
            } catch (parseErr) {
                // 기존 데이터 파싱 실패 시 그냥 진행
            }
            sheet.getRange(rowToUpdate, 1, 1, 2).setValues([[date, JSON.stringify(data)]]);
        } else {
            sheet.appendRow([date, JSON.stringify(data)]);
        }

        return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        logError("doPost", err, e ? e.postData.contents : "no data");
        return ContentService.createTextOutput(JSON.stringify({ result: "error", message: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
}

function doGet(e) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
        var date = e.parameter.date;
        if (!date) return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Date parameter missing" })).setMimeType(ContentService.MimeType.JSON);

        var targetNumeric = getNumericDate(date);

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
    } catch (err) {
        logError("doGet", err, JSON.stringify(e.parameter));
        return ContentService.createTextOutput(JSON.stringify({ result: "error", message: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
}

function logError(type, err, rawData) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var logSheet = ss.getSheetByName("ErrorLogs") || ss.insertSheet("ErrorLogs");
        if (logSheet.getLastRow() === 0) {
            logSheet.appendRow(["시간", "유형", "에러 메시지", "원본 데이터"]);
        }
        logSheet.appendRow([new Date(), type, err.message, rawData]);
    } catch (e) { }
}

// 어떤 형식이든 숫자만 추출하여 8자리(YYYYMMDD)로 정규화
function getNumericDate(cellValue) {
    if (!cellValue) return "";

    var str;
    if (cellValue instanceof Date) {
        str = Utilities.formatDate(cellValue, "GMT+9", "yyyy-MM-dd");
    } else {
        str = String(cellValue);
    }

    // 숫자만 추출 (예: "2026. 2. 23" -> "2026223")
    var nums = str.replace(/[^0-9]/g, "");

    // 만약 "2026223" 같이 월/일이 한자리인 경우를 위해 보정
    if (nums.length < 8 && (str.indexOf('.') !== -1 || str.indexOf('-') !== -1 || str.indexOf('/') !== -1)) {
        var parts = str.split(/[.\-\/]/).filter(function (p) { return p.trim().length > 0; });
        if (parts.length === 3) {
            var y = parts[0].trim();
            var m = parts[1].trim();
            var d = parts[2].trim();
            if (m.length === 1) m = "0" + m;
            if (d.length === 1) d = "0" + d;
            nums = y + m + d;
        }
    }

    return nums;
}
