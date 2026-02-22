function doPost(e) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    var date = data.date;

    // Find existing row with same date
    var values = sheet.getDataRange().getValues();
    var rowToUpdate = -1;
    for (var i = 1; i < values.length; i++) {
        if (values[i][0] == date) {
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

    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
        if (values[i][0] == date) {
            return ContentService.createTextOutput(values[i][1]).setMimeType(ContentService.MimeType.JSON);
        }
    }

    return ContentService.createTextOutput(JSON.stringify({ result: "not_found" })).setMimeType(ContentService.MimeType.JSON);
}
