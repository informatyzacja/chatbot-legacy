/*
 * SSPWr chatbot
 * 
 * Warning: This code does not guarantee sequential messages at all. If multiple messages
 * are required to be sent, they are all sent concurrently.
 *
 * Right now this is a good thing, as nothing in the chatbot needs to be sequential
 * - there's only single message replies to users' messages.
 *
 * However, if sequential messages become a requirement, the structure would need
 * to be changed a little bit (await on each successive sent message instead of
 * one big one for all of them in the handler)
 */

const https = require('https');
const crypto = require('crypto');

const config = {
    /*
     * Page IDs on which we respond to every text message with a prompt to
     * pick a question from menu. Helpful for testing.
     */
    RESPOND_TO_EVERYTHING_ON: process.env.RESPOND_TO_EVERYTHING_ON.split(','),
    
    /*
     * Token used when verifying the webhook to make sure we have the correct url
     */
    VERIFY_TOKEN: process.env.VERIFY_TOKEN,
    
    /*
     * Secret used for signature verification to be sure we're actually getting called
     * from Facebook and not someone typing the url in curl.
     */
    APP_SECRET: process.env.APP_SECRET,
    
    /*
     * Maps environment variables PAGE_ACCESS_TOKEN_123=aaa, PAGE_ACCESS_TOKEN_234=bbb
     * into the object:
     * {
     *     '123': 'aaa',
     *     '234': 'bbb'
     * }
     */
    PAGE_ACCESS_TOKEN:
        Object.entries(process.env)
        .filter(([key, value]) => key.startsWith('PAGE_ACCESS_TOKEN_'))
        .map(([key, value]) => [
            key.replace(/^PAGE_ACCESS_TOKEN_/, ''), value
        ])
        .reduce((obj, [key, value]) => (
            { ...obj, [key]: value }
        ), {})
};

/*
 * Config file format: object { payload_name: response_text, ... }
 *
 * Example:
 * {
 *   "limit_ects": "Limit ects zależy od wydziału",
 *   "asystentka": "Godziny pracy asystentki są na stronie ..."
 * }
 */
//const responses = require('./responses.json');
const responseConfig = require('./response_config.json');

const submenusByPayload =
    responseConfig.menu
    .reduce((obj, response) => ({
        ...obj,
        [response.payload]: response
    }), {});

/*
 * Copied from https://stackoverflow.com/a/31652607/3105260
 *
 * 'mąka' -> 'm\\u0105ka'
 */
function to_ascii_safe(text) {
    return text.replace(/[\u007F-\uFFFF]/g, function(chr) {
        return "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).substr(-4);
    });
}

/*
 * Node.js does not have a simple built-in to use API for sending HTTPS POST requests
 * Code adapted from https://stackoverflow.com/a/67094088/3105260
 */
async function post(url, data) {
    console.log("Sending a post request with data: ", JSON.stringify(data, null, 2))
    
    /*
     * No idea why escaping unicode sequences (to_ascii_safe) here is neccessary,
     * facebook isn't able to parse the JSON correctly otherwise, even if "; charset=utf-8"
     * is added to the Content-Type header
     *
     * Requests without escaping work when sent from curl though, a mistery.
     */
    const dataString = to_ascii_safe(JSON.stringify(data));

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': dataString.length,
        },
        timeout: 10000, // in ms
    };

    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            const body = [];
            res.on('data', (chunk) => {
                body.push(chunk);
            });
            res.on('end', () => {
                const resString = Buffer.concat(body).toString();
                if (res.statusCode < 200 || res.statusCode > 299) {
                    reject(new Error(`POST code=${res.statusCode} body: ${resString}`));
                } else {
                    resolve(resString);
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request time out'));
        });
        req.write(dataString);
        req.end();
    });
}

/*
 * Sends a `messaging` request to the Facebook API. Every message type (simple text,
 * quick response, buttons, ...) shares this format.
 */
function send_message(page_id, to, message) {
    if(!(page_id in config.PAGE_ACCESS_TOKEN)) {
        throw new Error(`[!!] Can't send message: no PAGE_ACCESS_TOKEN for page with id=${page_id}`);
    }
    
    const send_message_api = 
        `https://graph.facebook.com/v10.0/me/messages?access_token=${config.PAGE_ACCESS_TOKEN[page_id]}`;
        
    return post(send_message_api, {
        // Note: the "RESPONSE" type requires the person we're sending a message to
        // to have texted us in the last 24 hours
        messaging_type: "RESPONSE", 
        recipient: {
            id: to
        },
        message: message
    });
}


function set_ice_breakers(page_id) {
    if(!(page_id in config.PAGE_ACCESS_TOKEN)) {
        throw new Error(`[!!] Can't set ice breakers: no PAGE_ACCESS_TOKEN for page with id=${page_id}`);
    }
    
    const messenger_profile_url =
        `https://graph.facebook.com/v10.0/me/messenger_profile?access_token=${config.PAGE_ACCESS_TOKEN[page_id]}`;
    
    const ice_breakers = responseConfig.menu
        .filter(menuItem => menuItem.inIceBreakers)
        .map(menuItem => ({
            payload: menuItem.payload,
            question: menuItem.buttonText
        }));
      
    return post(messenger_profile_url, {
        ice_breakers: ice_breakers
    })
}

/*
 * Sends a message with additional `quick_replies` buttons attached to it.
 * 
 * page_id: Sender id (string)
 *
 * to: Receiver id (string)
 *
 * text: Text for the message (string)
 *     - required by facebook to be nonempty and contain some non-whitespace characters.
 *
 * menu: A set of quick_reply buttons (array of objects)
 *     - example:
 *       [ { buttonText: "button 1", payload: "1" },
 *         { buttonText: "button 2", payload: "2" },
 *         ... ]
 */
function quick_replies_menu(page_id, to, text, menu) {
    const quick_replies = menu.map(({buttonText, payload}) => ({
        content_type: 'text',
        title: buttonText,
        payload: payload
    }));
    
    return send_message(page_id, to, {
        text: text,
        quick_replies: quick_replies
    });
}

function toplevel_quick_replies_menu(page_id, to, text) {
    const menu = responseConfig.menu
        .filter(menuItem => menuItem.inQuickMenu)
        .map(({ buttonText, payload }) => ({ buttonText, payload }));
        
    return quick_replies_menu(page_id, to, text, menu);
}

/*
 * Gets called with every single message received to every page except the test page
 * (requets['entry'][i]['messaging'][j]), a message being in the format of:
 *
 * {
 *   sender: { id: '3810638709058584' },
 *   recipient: { id: '108276354796392' },
 *   timestamp: 1622334055157,
 *   message: {   // (optional)
 *     mid: 'm_OJ3NJTV9IoKa2BQ-y9zQ...',
 *     text: 'message text content',
 *     nlp: { ... }
 *   },
 *   postback: {   // (optional)
 *     payload: 'asystentka',
 *   }
 * }
 *
 * Returns promises for requests made to facebook
 */
function messaging_entry(page_id, messaging) {
    const person_id = messaging.sender.id;
    const message = messaging.message || {};
    const text = message.text || '';
    
    /*
     * Payload set by quick reply buttons
     */
    const quick_reply_payload = (message.quick_reply || {}).payload;
    
    /*
     * Payload set by the `ice_breaker`s displayed at the beginning of the conversation
     */
    const ice_breaker_payload = (messaging.postback || {}).payload;
    
    /* 
     * Ignore messages sent by us, preventing a possible loop with the chatbot
     * talking to itself 
     */
    if(person_id == page_id)
        return;
    
    var payload = ice_breaker_payload || quick_reply_payload;
    
    if(payload in responseConfig.responses) {
        /*
         * A response to a payload (received from either interacting with the 
         * ice_breakers or quick_replies) with a simple answer and a loop back
         * to the toplevel menu
         */
        const text = responseConfig.responses[payload];
        return [
            toplevel_quick_replies_menu(page_id, person_id, text)
        ];
    }
    
    if(payload in submenusByPayload) {
        const submenu = submenusByPayload[payload];
        
        if(submenu.choices) {
            /*
             * A menu entry with an additional submenu (`submenu.choices`), and
             * an optional response text message.
             */
            const text = submenu.response != null
                ? responseConfig.responses[submenu.response]
                : responseConfig.defaultSubmenuResponse;
            
            if(submenu.noQuickMenuAfter)
                return [ send_message(page_id, person_id, {text: text}) ];
            else
                return [ quick_replies_menu(page_id, person_id, text, submenu.choices) ];
        }
        
        if(submenu.response != null) {
            /*
             * A menu entry without an additional submenu, but with a response.
             * Loops back to the toplevel menu.
             */
            const text = responseConfig.responses[submenu.response];
            if(submenu.noQuickMenuAfter)
                return [ send_message(page_id, person_id, {text: text}) ];
            else
                return [ toplevel_quick_replies_menu(page_id, person_id, text) ];
        }
    }
    
    /*
     * On dev and staging fanpages, reply to every normal text message with the  
     * toplevel menu for easier testing.
     */
    if(config.RESPOND_TO_EVERYTHING_ON.includes(page_id)) {
        if(text) {
            return [ toplevel_quick_replies_menu(page_id, person_id, 'Wybierz kategorię pytania') ];
        }
    }

    return [];
}

/*
 * Gets called with data (request['entry'][i]) in the format of
 *
 * {
 *   id: '108276354796392',
 *   time: 1622334438323,
 *   messaging: [
 *     { ... (messaging_entry) },
 *     { ... (messaging_entry) },
 *     ...
 *   ]
 * }
 *
 * Returns promises for requests made to facebook to end
 */
function page_entry(page_entry) {
    let promises = [];
    
    // The id of a page the bot acts as (the same as in https://m.me/<page_id>)
    const id = page_entry.id;
    
    if(Array.isArray(page_entry.messaging)) {
        for(let entry of page_entry.messaging) {
            promises.push(...messaging_entry(id, entry));
        }
    }
    
    return promises;
}


/*
 * Gets called with data (the whole request) in the format of
 *
 * {
 *   object: 'page',
 *   entry: [
 *     { ... (page_entry) },
 *     { ... (page_entry) },
 *     ...
 *   ]
 * }
 *
 * Returns promises for requests made to facebook to end
 */
function post_request(body) {
    console.log('Received POST data:', JSON.stringify(body, null, 2));

    /*
     * Promise for message sending - makes sure to not return from the Lambda before
     * actually responding to the message
     */
    let promises = [];
    
    if(body.object == 'page' && Array.isArray(body.entry)) {
        for(let entry of body.entry) {
            promises.push(...page_entry(entry));
        }
    }

    return promises;
}

/*
 * Handle the Facebook webhook verification procedure
 *
 * We get a GET with 
 *   /path?hub.mode=subsribe&hub.verify_token=...&hub.challenge=...
 *
 * and have to respond with the value of the gotten "hub.challenge"
 *
 * The value of "hub.verify_token" is going to be the same as a string pasted
 * into the Facebook GUI
 */
function get_request(queryStringParameters) {
    // Parse the query params
    let mode = queryStringParameters["hub.mode"];
    let token = queryStringParameters["hub.verify_token"];
    let challenge = queryStringParameters["hub.challenge"];

    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
        // Checks the mode and token sent is correct
        if (mode === "subscribe" && token === config.VERIFY_TOKEN) {
            // Responds with the challenge token from the request
            console.log("[!!] webhook verified");
            return {
                statusCode: 200,
                body: challenge
            };
        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            console.log("[!!] webhook not verified - tokens do not match");
            return {
                statusCode: 403,
                body: ""
            };
        }
    }
}

/*
 * Make sure the request actually comes from Facebook by comparing the signature
 */
function valid_signature(signature, body) {
    let hmac = crypto.createHmac('sha1', config.APP_SECRET);
    hmac.update(body, 'utf-8');
    return signature == `sha1=${hmac.digest("hex")}`;
}

exports.handler = async (event, context) => {
    try {
        console.log('Received event:', JSON.stringify(event, null, 2));
        
        if(event.version && event.version != '2.0') {
            console.log(`[!!] WARNING: event.version ('${event.version}') different `
                + `from expected '2.0' - if something breaks it's propably because of this`);
        }
        
        const httpMethod = event.httpMethod || event.requestContext.http.method;

        if(httpMethod == 'GET') {
            /*
            * The "verify" message goes through a GET request
            */
            return get_request(event.queryStringParameters);
        } else if(httpMethod == 'POST') {
            /*
             * Everything else (e.g. messages, typing notifications, reactions, ...)
             * gets received through a POST.
             */

            /*
             * Triggered by Netlify when a successfull deploy is finished
             */
            if(event.queryStringParameters.webhookSuccessfulDeploy == '1') {
                /*
                 * A way to set desired `ice_breakes` - just invoke the Lambda with
                 * input set to {"set_ice_breakers":true}
                 */
                for(let page_id of Object.keys(config.PAGE_ACCESS_TOKEN)) {
                    console.log(`Setting ice breakers for page with id ${page_id}`);
                    await set_ice_breakers(page_id);
                }

                return {
                    statusCode: 200,
                    body: '"set ice_breakers"',
                };
            }
             
            /*
             * Make sure the request actually comes from Facebook by comparing the signature
             */
            if(!valid_signature(event.headers['x-hub-signature'], event.body)) {
                throw new Error('Invalid signature');
            }
             
            /*
             * We wait for all message responses to finish sending out
             */
            await Promise.all(post_request(JSON.parse(event.body)));

            return {
                statusCode: 200,
                body: ""
            };
        } else {
             /*
              * No other request method should ever be reveived from Facebook
              */
            throw new Error(`Unsupported method "${event.httpMethod}"`);
        }
    } catch(e) {
        console.error("[!!] Got an error but returning 200 anyway to not make facebook mad", e);
        return {
            statusCode: 200,
            body: e.toString()
        };
    }
};

