function GenerateChadbotConfig() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  var responses = {};
  var default_response = '';
  var menu = [];
  var podmenu = {};

  var result = {};


  //
  // Responses processing
  //
  // NOTE(sdatko): shift() is used to drop the first row
  //               from data, which is header in our case
  //
  // NOTE(sdatko): filter is used to remove empty rows from data
  //
  var sheet = spreadsheet.getSheetByName('ODPOWIEDZI');
  var rows = sheet.getDataRange().getValues();
  rows.shift();
  rows = rows.filter(e => e[0].length);

  rows.forEach(function (row) {
    var key = row[0];
    var value = row[1];

    responses[key] = value;
  });


  //
  // Default response processing
  //
  default_response = spreadsheet.getSheetByName('USTAWIENIA')
                     .getRange('B2').getValue();


  //
  // Podmenu processing
  //
  // NOTE(sdatko): shift() is used to drop the first row
  //               from data, which is header in our case
  //
  // NOTE(sdatko): filter is used to remove empty rows from data
  //
  var sheet = spreadsheet.getSheetByName('PODMENU');
  var rows = sheet.getDataRange().getValues();
  rows.shift();
  rows = rows.filter(e => e[0].length);

  rows.forEach(function (row) {
    var key = row[0];
    var payload = row[1];
    var buttonText = row[2];

    var podmenu_entry = {
      'payload': payload,
      'buttonText': buttonText,
    }

    if(! podmenu[key]) {
      podmenu[key] = [];
    }

    podmenu[key].push(podmenu_entry);
  });


  //
  // Menu processing
  //
  // NOTE(sdatko): shift() is used to drop the first row
  //               from data, which is header in our case
  //
  // NOTE(sdatko): filter is used to remove empty rows from data
  //
  var sheet = spreadsheet.getSheetByName('MENU');
  var rows = sheet.getDataRange().getValues();
  rows.shift();
  rows = rows.filter(e => e[0].length);

  rows.forEach(function (row) {
    var payload = row[0];
    var buttonText = row[1];
    var inIceBreakers = row[2];
    var inQuickMenu = row[3];
    var type = row[4];
    var response = row[5];
    var submenu = row[6];
    var noQuickMenuAfter = row[7];

    var menu_entry = {
      'payload': payload,
      'buttonText': buttonText,
      'inIceBreakers': inIceBreakers,
      'inQuickMenu': inQuickMenu,
    };

    if(type == 'ODPOWIEDŹ') {
      menu_entry['response'] = response;
    } else {
      menu_entry['choices'] = podmenu[submenu];
    }

    if(noQuickMenuAfter == true) {
      menu_entry['noQuickMenuAfter'] = true;
    }

    menu.push(menu_entry);
  });


  //
  // Assembly the result
  //
  result['responses'] = responses;
  result['defaultSubmenuResponse'] = default_response;
  result['menu'] = menu;


  //
  // Put result in output cell as JSON string
  //
  var sheet = spreadsheet.getSheetByName('WYNIK');
  var cell = sheet.getRange('A1');
  cell.setValue(JSON.stringify(result, null, '    '));
}
