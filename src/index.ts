declare var console;

const logger = console;
const INIT_ACTION = "@ngrx/store/init";

const repeat = (str, times) => (new Array(times + 1)).join(str);
const pad = (num, maxLength) => repeat(`0`, maxLength - num.toString().length) + num;
const formatTime = (time) => `@ ${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`;
const timer = typeof performance !== `undefined` && typeof performance.now === `function` ? performance : Date;

const getLogLevel = (level, action, payload, type) => {
    switch (typeof level) {
        case `object`:
            return typeof level[type] === `function` ? level[type](...payload) : level[type];
        case `function`:
            return level(action);
        default:
            return level;
    }
};

const printBuffer = options => logBuffer => {
    const { actionTransformer, collapsed, colors, timestamp, duration, level } = options;
    logBuffer.forEach((logEntry, key) => {
        const { started, startedTime, action, error } = logEntry;
        const prevState = logEntry.prevState.nextState ? logEntry.prevState.nextState : '(Empty)';
        let { took, nextState } = logEntry;
        const nextEntry = logBuffer[key + 1];
        if (nextEntry) {
            nextState = nextEntry.prevState;
            took = nextEntry.started - started;
        }

        const formattedAction = actionTransformer(action);
        const isCollapsed = (typeof collapsed === `function`) ? collapsed(() => nextState, action) : collapsed;

        const formattedTime = formatTime(startedTime);
        const titleCSS = colors.title ? `color: ${colors.title(formattedAction)};` : null;
        const title = `action ${timestamp ? formattedTime : ``} ${formattedAction.type} ${duration ? `(in ${took.toFixed(2)} ms)` : ``}`;

        try {
            if (isCollapsed) {
                if (colors.title) logger.groupCollapsed(`%c ${title}`, titleCSS);
                else logger.groupCollapsed(title);
            } else {
                if (colors.title) logger.group(`%c ${title}`, titleCSS);
                else logger.group(title);
            }
        } catch (e) {
            logger.log(title);
        }

        const prevStateLevel = getLogLevel(level, formattedAction, [prevState], `prevState`);
        const actionLevel = getLogLevel(level, formattedAction, [formattedAction], `action`);
        const errorLevel = getLogLevel(level, formattedAction, [error, prevState], `error`);
        const nextStateLevel = getLogLevel(level, formattedAction, [nextState], `nextState`);

        if (prevStateLevel) {
            if (colors.prevState) logger[prevStateLevel](`%c prev state`, `color: ${colors.prevState(prevState)}; font-weight: bold`, prevState);
            else logger[prevStateLevel](`prev state`, prevState);
        }

        if (actionLevel) {
            if (colors.action) logger[actionLevel](`%c action`, `color: ${colors.action(formattedAction)}; font-weight: bold`, formattedAction);
            else logger[actionLevel](`action`, formattedAction);
        }

        if (error && errorLevel) {
            if (colors.error) logger[errorLevel](`%c error`, `color: ${colors.error(error, prevState)}; font-weight: bold`, error);
            else logger[errorLevel](`error`, error);
        }

        if (nextStateLevel) {
            if (colors.nextState) logger[nextStateLevel](`%c next state`, `color: ${colors.nextState(nextState)}; font-weight: bold`, nextState);
            else logger[nextStateLevel](`next state`, nextState);
        }

        try {
            logger.groupEnd();
        } catch (e) {
            logger.log(`—— log end ——`);
        }
    });
    logBuffer.length = 0;
};

const postToServer = (options, logPoster: LogPoster) => logBuffer => {
    const { actionTransformer, timestamp, duration, posterOptions } = options;

    logBuffer.forEach((logEntry, key) => {
        const { started, startedTime, action, error } = logEntry;
        const prevState = logEntry.prevState.nextState ? logEntry.prevState.nextState : '(Empty)';
        let { took, nextState } = logEntry;
        const nextEntry = logBuffer[key + 1];

        if (nextEntry) {
            nextState = nextEntry.prevState;
            took = nextEntry.started - started;
        }

        const formattedAction = actionTransformer(action);
        const formattedTime = formatTime(startedTime);
        const title = `action ${timestamp ? formattedTime : ``} ${formattedAction.type} ${duration ? `(in ${took.toFixed(2)} ms)` : ``}`;

        // Check if it's a action intended to post, then extract if the level is desired to be tracked.
        let logToPost: ServerLogObject = { title: title };

        const postPrevStateLevel = getLogLevel(posterOptions.level, formattedAction, [prevState], 'prevState');
        const postActionLevel = getLogLevel(posterOptions.level, formattedAction, [formattedAction], 'action');
        const postErrorLevel = getLogLevel(posterOptions.level, formattedAction, [error, prevState], 'error');
        const postNextStateLevel = getLogLevel(posterOptions.level, formattedAction, [nextState], 'nextState');

        if (postPrevStateLevel) logToPost.prevState = prevState;
        if (postActionLevel) logToPost.action = formattedAction;
        if (error && postErrorLevel) logToPost.error = error;
        if (postNextStateLevel) logToPost.nextState = nextState;

        logPoster.postLog(logToPost);
    });

    logBuffer.length = 0;
}

const isAllowed = (action, filter) => {
    if (!filter) {
        return true;
    }
    if (filter.whitelist && filter.whitelist.length) {
        return filter.whitelist.indexOf(action.type) !== -1;
    }
    return filter.blacklist && filter.blacklist.indexOf(action.type) === -1;
};

export const storeLogger = (opts: LoggerOptions = {}, logPoster?: LogPoster) => (reducer: Function) => {
    let log = {};
    const ua = typeof window !== 'undefined' && window.navigator.userAgent ? window.navigator.userAgent : '';
    let ms_ie = false;
    //fix for action display in IE
    const old_ie = ua.indexOf('MSIE ');
    const new_ie = ua.indexOf('Trident/');

    if ((old_ie > -1) || (new_ie > -1)) {
        ms_ie = true;
    }

    let colors: LoggerColorsOption;
    if (ms_ie) {
        // Setting colors functions to null when it's an IE browser.
        colors = {
            title: null,
            prevState: null,
            action: null,
            nextState: null,
            error: null,
        }
    } else {
        colors = {
            title: null,
            prevState: () => '#9E9E9E',
            action: () => '#03A9F4',
            nextState: () => '#4CAF50',
            error: () => '#F20404',
        }
    }

    const defaults: LoggerOptions = {
        level: 'log',
        collapsed: false,
        duration: true,
        timestamp: true,
        stateTransformer: state => state,
        actionTransformer: actn => actn,
        filter: {
            whitelist: [],
            blacklist: []
        },
        colors: colors,
        posterOptions: {
            whitelist: [],
            blacklist: [],
            level: {
                error: (payload) => payload,
                prevState: (payload) => payload,
                nextState: (payload) => payload,
                action: (payload) => payload
            }
        }
    };

    const options = Object.assign({}, defaults, opts);
    const { stateTransformer } = options;
    const buffer = printBuffer(options);
    const poster = postToServer(options, logPoster);

    return function (state, action) {
        let preLog = {
            started: timer.now(),
            startedTime: new Date(),
            prevState: stateTransformer(log),
            action
        };

        let nextState = reducer(state, action);

        let postLog = {
            took: timer.now() - preLog.started,
            nextState: stateTransformer(nextState)
        };
        log = Object.assign({}, preLog, postLog);
        //ignore init action fired by store and devtools
        if (action.type !== INIT_ACTION) {
            // If is allowed to post to server
            if (isAllowed(action, options.filter)) {
                buffer([log]);
            }

            // If is allowed to post to server
            if (isAllowed(action, options.posterOptions)) {
                poster([log]);
            }
        }

        return nextState;
    }
};

export interface LoggerOptions {
    /**
     * 'log' | 'console' | 'warn' | 'error' | 'info'. Default: 'log'
     */
    level?: any;
    /**
     * Should log group be collapsed? default: false
     */
    collapsed?: boolean;
    /**
     * Print duration with action? default: true
     */
    duration?: boolean;
    /**
     * Print timestamp with action? default: true
     */
    timestamp?: boolean;
    filter?: LoggerFilterOption;
    /**
     * Transform state before print default: state => state
     */
    stateTransformer?: (state: Object) => Object;
    /**
     * Transform action before print default: actn => actn
     */
    actionTransformer?: (actn: Object) => Object;
    colors?: LoggerColorsOption;
    /**
     * Defines the criteria of which action post
     */
    posterOptions?: LogPosterOptions;
};

export interface LoggerFilterOption {
    /**
     * Only print actions included in this list - has priority over blacklist
     */
    whitelist?: string[];
    /**
     * Only print actions that are NOT included in this list
     */
    blacklist?: string[];
}

export interface LogPosterOptions {
    /**
     * Only post actions included in this list - has priority over blacklist
     */
    whitelist?: string[];
    /**
     * Only post actions that are NOT included in this list
     */
    blacklist?: string[];
    /**
     * Define which level of log send. Defafult: 'error'
     */
    level?: LogLevelObj;
}

export interface LogLevelObj {
    error: (payload: any) => any;
    prevState?: (payload: any) => any;
    action?: (payload: any) => any;
    nextState?: (payload: any) => any;
};

export interface LoggerColorsOption {
    title: (action: Object) => string;
    prevState: (prevState: Object) => string;
    action: (action: Object) => string;
    nextState: (nextState: Object) => string;
    error: (error: any, prevState: Object) => string;
}

export interface ServerLogObject {
    title;
    error?;
    action?;
    prevState?;
    nextState?;
}

export abstract class LogPoster {
    /**
     * Implement this function to define how the logs are posted to your server.
     * 
     * @param serverPostObj Object that holds the state to be logged
     */
    abstract postLog(serverPostObj: ServerLogObject): void;
}
