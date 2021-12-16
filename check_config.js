const config = require('./response_config.json');

function hasDuplicates(array) {
    return new Set(array).size != array.length;
}

function isStringWithNonWhitespaceCharacters(s) {
    return typeof s == 'string' && s.trim().length !== 0;
}

function has(object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
}

function isEmpty(object) {
    for(const i in object) {
        return false;
    }
    return true;
}

// TODO - limit liczby ice_breakerów - 20?
// TODO - limit liczby guzików w choices (quick_replies) - ?
// w dokumentacji Facebooka nie da się tego znaleźć - prawdopodobnie trzeba do tego dojść metodą prób i błędów

function invalidConfigDescription(config) {
    function hasResponseToPayload(payload) {
        return has(config.responses, payload) || config.menu.filter(item => item.payload === payload).length != 0;
    }

    if(!config.responses) {
        return "config.responses powinno istnieć";
    }

    if(isEmpty(config.responses)) {
        return "config.responses nie może być pusty";
    }

    for(const payload in config.responses) {
        if(payload == 'nic' || payload.startsWith('menu_')) {
            return `config.responses.${payload} nie może zawierać klucza o wartości "nic" lub zaczynającego się od "menu_"`
        }

        if(!isStringWithNonWhitespaceCharacters(config.responses[payload])) {
            return `config.responses.${payload} (= ${config.responses[payload]}) powinien być niepustym stringiem`
        }
    }

    if(!isStringWithNonWhitespaceCharacters(config.defaultSubmenuResponse)) {
        return "config.defaultSubmenuResponse nie może być pustym stringiem ani stringiem składającym " +
            "się z samych białych znaków  (facebook nie pozwala na przesłanie guzików bez wiadomości)";
    }

    if(!config.menu || !Array.isArray(config.menu)) {
        return "config.menu powinno być tablicą";
    }

    if(config.menu.length == 0) {
        return "config.menu nie może być pustą tablicą";
    }

    for(const i in config.menu) {
        const item = config.menu[i];

        if(typeof item.payload !== 'string' || !(item.payload == 'nic' || item.payload.startsWith('menu_')))
            return `config.menu[${i}].payload powinien być stringiem o wartości "nic" lub zaczynającym się od "menu_"`

        if(!isStringWithNonWhitespaceCharacters(item.buttonText)) {
            return `config.menu[${i}].buttonText (payload: '${item.payload}') musi być niepustym ciągiem znaków`;
        }

        if(item.buttonText.length > 20) {
            return `config.menu[${i}].buttonText (payload: '${item.payload}') nie może być dłuższy niż 20 znaków - `
                + `ograniczenie Facebooka (aktualna wartość to '${item.buttonText}', ${item.buttonText.length} znaków)`;
        }

        if(typeof item.inIceBreakers !== 'boolean') {
            return `config.menu[${i}].inIceBreakers (payload: '${item.payload}') musi wynosić true lub false - oznacza `
                + `on czy menu pojawi się na początku rozmowy`;
        }

        if(typeof item.inQuickMenu !== 'boolean') {
            return `config.menu[${i}].inQuickMenu (payload: '${item.payload}') musi wynosić true lub false - oznacza on `
                + `czy menu pojawi się w guzikach po odpowiedzeniu na inne pytanie`;
        }

        if(has(item, 'noQuickMenuAfter')) {
            if(item.noQuickMenuAfter !== true) {
                return `config.menu[${i}].noQuickMenuAfter (payload: '${item.payload}') - jeżeli jest ustawione musi `
                    + `wynośić true (aktualna wartość: ${item.noQuickMenuAfter})`
            }
        }

        const hasResponse = has(item, 'response');
        const hasChoices = has(item, 'choices');

        if(!hasResponse && !hasChoices) {
            return `config.menu[${i}] (payload: '${item.payload}') - 'response' albo 'choices' (lub oba) powinno być `
                + `ustawione przy elemencie menu`;
        }
    
        if(hasResponse && !has(config.responses, item.response)) {
            return `config.menu[${i}].response (payload: '${item.payload}') - 'response' powinno mieć taką wartość jak `
                + `klucz w config.responses - config.responses[${item.response}] nie istnieje`;
        }

        if(hasChoices) {
            if(!Array.isArray(item.choices)) {
                return `config.menu[${i}].choices (payload: '${item.payload}') - 'choices' powinna być tablicą (aktualnie `
                    + `jest typu ${typeof item.choices})`;
            }

            if(item.choices.length == 0) {
                return `config.menu[${i}].choices (payload: '${item.payload}') - tablica 'choices' nie może być pusta`;
            }

            for(const choice of item.choices) {
                if(!isStringWithNonWhitespaceCharacters(item.buttonText)) {
                    return `config.menu[${i}].choices[${i}].buttonText musi być niepustym ciągiem znaków`;
                }

                if(choice.buttonText.length > 20) {
                    return `config.menu[${i}].choices[${i}].buttonText nie może być dłuższy niż 20 znaków - ograniczenie `
                        + `Facebooka (aktualna wartość to '${choice.buttonText}', ${choice.buttonText.length} znaków)`;
                }

                if(typeof choice.payload !== 'string') {
                    return `config.menu[${i}].choices[${i}].payload musi być ciągiem znaków`;
                }

                if(!hasResponseToPayload(choice.payload)) {
                    return `config.menu[${i}].choices[${i}].payload (wartość: '${choice.payload}') - nie istnieje item w `
                        + `config.menu ani odpowiedź w config.responses która mogła by zareagować na ten payload`;
                }
            }
        }
    }

    if(hasDuplicates(config.menu.map(item => item.payload))) {
        return `config.menu[...].payload musi być unikatowy - nie może się powtarzać`
    }

    return null;
}

console.log(invalidConfigDescription(config))
