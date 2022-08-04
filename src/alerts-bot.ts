import axios from 'axios';

const channelId = "C03RK8Q37FY"; // "ID of monitor-alerts channel"
const token = "xoxb-3511023054901-3869372105702-M0leS5Y2o8WlIjA4UVPrdAeo"; // The Bot User OAuth Token given by slack 
const timePeriod = 60 * 5; // The allowed repeat interval of alert (unit: second)

async function requestSlackHelper(method: string, url: string, params: any, data: any) {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': 'Bearer ' + token,
    };
    try {
        const res = await axios({
            method,
            url,
            params,
            headers,
            data
        });
        if (!res.data.ok) {
            throw new Error('Failed to alert in Slack: ' + res.data.error);
        };
        return res.data;
    } catch(e) {
        console.log(e);
    }
}

async function fetchHistoryMessages() {
    const url = "https://slack.com/api/conversations.history";
    const params = {
        'channel': channelId
    };
    const historyMsg = (await requestSlackHelper('GET', url, params, {})).messages;
    const localTimeStamp = Math.floor(new Date().getTime() / 1000);
    const historyMsgInRange = historyMsg.filter((msg: { "ts": string }) => localTimeStamp - Number(msg.ts) < timePeriod);
    return historyMsgInRange.map((msg: {"text": string}) => msg.text);
}

async function sendNewMessage(text: string) {
    const url = "https://slack.com/api/chat.postMessage";
    const data = {
        channel: channelId,
        text: text
    };
    await requestSlackHelper('POST', url, {}, data);
}

export async function sendAlert(text: any) {
    const historyMessages = await fetchHistoryMessages();
    const newMessage = text.toString() + '.\n' + text.stack ? text.stack : '';
    if(!historyMessages.includes(newMessage)) {
        await sendNewMessage(newMessage);
    };
}
