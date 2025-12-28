import * as vscode from 'vscode';

let currentGeminiTerminal: vscode.Terminal | undefined;

async function activate(context: vscode.ExtensionContext) {

    // Forcefully disable any lingering Claude environment variables
    process.env['CLAUDE_CODE_SSE_PORT'] = '';
    process.env['ENABLE_IDE_INTEGRATION'] = 'false';
    console.log('Claude-related environment variables have been forcefully unset.');

    // 기존 Gemini 터미널 정리
    const cleanupExistingTerminals = () => {
        const existingTerminals = vscode.window.terminals;
        existingTerminals.forEach(terminal => {
            if (terminal.name === 'Gemini' || terminal.name.includes('gemini')) {
                terminal.dispose();
            }
        });
    };

    // 초기 정리
    cleanupExistingTerminals();

    // Gemini 터미널 시작 (1초 후)
    setTimeout(async () => {
        try {
            cleanupExistingTerminals();
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const terminal = vscode.window.createTerminal('Gemini');
            currentGeminiTerminal = terminal;
            terminal.show();
            terminal.sendText('gemini');
        } catch (error) {
            console.error('Gemini 시작 실패:', error);
            vscode.window.showInformationMessage('Gemini를 시작할 수 없습니다. gemini 명령어가 설치되어 있는지 확인해주세요.');
        }
    }, 1000);

    // 웹뷰 프로바이더 생성
    const provider = new GeminiAssistantProvider(
        context.extensionUri,
        () => currentGeminiTerminal,
        (terminal) => { currentGeminiTerminal = terminal; }
    );

    // 웹뷰 등록
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('gemini-korean-assistant', provider)
    );

    // 명령어 등록
    context.subscriptions.push(
        vscode.commands.registerCommand('gemini-korean.showInput', () => {
            vscode.commands.executeCommand('gemini-korean-assistant.focus');
        })
    );

    // 터미널 종료 감지
    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((terminal) => {
            if (terminal === currentGeminiTerminal) {
                currentGeminiTerminal = undefined;
            }
        })
    );
}

class GeminiAssistantProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'gemini-korean-assistant';
    private _view?: vscode.WebviewView;
    private _inputText: string = '';

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getCurrentGeminiTerminal: () => vscode.Terminal | undefined,
        private readonly _setCurrentGeminiTerminal: (terminal: vscode.Terminal) => void
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 웹뷰 메시지 처리
        webviewView.webview.onDidReceiveMessage(
            async (data) => {
                switch (data.type) {
                    case 'updateText':
                        this._inputText = data.value;
                        break;
                    case 'sendToGemini':
                        await this.sendToGemini(data.shouldFlush);
                        break;
                    case 'clearInput':
                        this.clearInput();
                        break;
                    case 'newChat':
                        await this.newChat();
                        break;
                    case 'addFile':
                        await this.addFile();
                        break;
                    case 'addFolder':
                        await this.addFolder();
                        break;


                    case 'openGithub':
                        await this.openGithub();
                        break;
                    case 'openEmail':
                        await this.openEmail();
                        break;
                }
            },
            undefined,
            []
        );
    }

    private async sendToGemini(shouldFlush: boolean = true) {
        console.log('=== sendToGemini called ===');
        console.log('Input text before processing:', JSON.stringify(this._inputText));
        console.log('Input text empty?', !this._inputText);
        
        if (this._inputText) {
            try {
                const currentTerminal = this._getCurrentGeminiTerminal();
                
                if (currentTerminal && vscode.window.terminals.includes(currentTerminal)) {
                    // Gemini가 이미 실행 중이면 바로 전송 (포커스 보존)
                    currentTerminal.show(true);
                    
                    // 상세 디버깅 정보
                    console.log('=== Gemini Extension Debug ===');
                    console.log('Terminal exists:', !!currentTerminal);
                    console.log('Terminal name:', currentTerminal.name);
                    console.log('Input text:', JSON.stringify(this._inputText));
                    console.log('Input text length:', this._inputText.length);
                    console.log('Input text bytes:', new TextEncoder().encode(this._inputText));
                    
                    
                    // 단순하게 텍스트만 전송
                    console.log('Sending text only...');
                    currentTerminal.sendText(this._inputText, false);
                    
                    // 500ms 후 자동 엔터
                    setTimeout(() => {
                        console.log('Auto Enter after 500ms...');
                        currentTerminal.sendText('', true);
                    }, 500);
                    
                    console.log('Text sent to terminal at:', new Date().toISOString());
                    
                    // 체크박스가 체크되어 있으면 메시지 삭제
                    if (shouldFlush) {
                        this._inputText = '';
                        if (this._view) {
                            this._view.webview.postMessage({ type: 'clear' });
                        }
                    }
                } else {
                    // Gemini가 실행되지 않았으면 새로 시작
                    const terminal = vscode.window.createTerminal('Gemini');
                    this._setCurrentGeminiTerminal(terminal);
                    terminal.show(true); // 포커스 보존
                    terminal.sendText('gemini');
                    
                    // Gemini 초기화 후 텍스트 전송
                    setTimeout(async () => {
                        // 상세 디버깅 정보
                        console.log('=== New Gemini Terminal Debug ===');
                        console.log('New terminal name:', terminal.name);
                        console.log('Input text:', JSON.stringify(this._inputText));
                        console.log('Input text length:', this._inputText.length);
                        console.log('Delay after Gemini start: 1200ms');
                        
                        
                        // 새 터미널에서도 단순하게
                        console.log('New Terminal: Sending text only...');
                        terminal.sendText(this._inputText, false);
                        
                        // 새 터미널에서도 500ms 후 자동 엔터
                        setTimeout(() => {
                            console.log('New Terminal: Auto Enter after 500ms...');
                            terminal.sendText('', true);
                        }, 500);
                        
                        console.log('Text sent to new terminal at:', new Date().toISOString());
                        
                        // 체크박스가 체크되어 있으면 메시지 삭제
                        if (shouldFlush) {
                            this._inputText = '';
                            if (this._view) {
                                this._view.webview.postMessage({ type: 'clear' });
                            }
                        }
                    }, 1200);
                }
            } catch (error) {
                vscode.window.showErrorMessage('Gemini Code로 명령어를 전송하지 못했습니다');
            }
        }
    }

    private clearInput() {
        this._inputText = '';
        if (this._view) {
            this._view.webview.postMessage({ type: 'clear' });
        }
        
        // Gemini 터미널 입력 초기화 (Ctrl+C)
        const currentTerminal = this._getCurrentGeminiTerminal();
        if (currentTerminal && vscode.window.terminals.includes(currentTerminal)) {
            currentTerminal.show();
            currentTerminal.sendText('\u0003', false);
        }
    }

    private async newChat() {
        try {
            const terminal = vscode.window.createTerminal('Gemini');
            this._setCurrentGeminiTerminal(terminal);
            terminal.show();
            terminal.sendText('gemini');
        } catch (error) {
            console.error('새 Gemini 채팅을 시작하지 못했습니다:', error);
            vscode.window.showErrorMessage('새 Gemini 채팅을 시작하지 못했습니다');
        }
    }

    private async addFile() {
        try {
            const selectedPaths = await this.showFileDialog();
            if (selectedPaths && selectedPaths.length > 0) {
                const filePaths = selectedPaths.map(path => `"${path}"`).join(' ');
                const currentText = this._inputText || '';
                const separator = currentText ? ' ' : '';
                this._inputText = currentText + separator + filePaths;
                
                if (this._view) {
                    this._view.webview.postMessage({
                        type: 'addText',
                        value: this._inputText
                    });
                }
                vscode.window.showInformationMessage(`${selectedPaths.length}개의 파일이 추가되었습니다`);
            }
        } catch (error) {
            console.error('파일 선택에 실패했습니다:', error);
            vscode.window.showErrorMessage('파일 선택에 실패했습니다');
        }
    }

    private async addFolder() {
        try {
            const selectedPath = await this.showFolderDialog();
            if (selectedPath) {
                const folderPath = `"${selectedPath}"`;
                const currentText = this._inputText || '';
                const separator = currentText ? ' ' : '';
                this._inputText = currentText + separator + folderPath;
                
                if (this._view) {
                    this._view.webview.postMessage({
                        type: 'addText',
                        value: this._inputText
                    });
                }
                vscode.window.showInformationMessage('폴더가 추가되었습니다');
            }
        } catch (error) {
            console.error('폴더 선택에 실패했습니다:', error);
            vscode.window.showErrorMessage('폴더 선택에 실패했습니다');
        }
    }





    private async openGithub() {
        try {
            await vscode.env.openExternal(vscode.Uri.parse('https://github.com/aicrafter/gemini-code-assistant-korean'));
            vscode.window.showInformationMessage('Github 페이지로 이동합니다');
        } catch (error) {
            console.error('Github 페이지를 열지 못했습니다:', error);
            vscode.window.showErrorMessage('Github 페이지를 열지 못했습니다');
        }
    }

    private async openEmail() {
        try {
            await vscode.env.openExternal(vscode.Uri.parse('mailto:ads.crewlabs@gmail.com'));
            vscode.window.showInformationMessage('이메일 클라이언트가 열립니다');
        } catch (error) {
            console.error('이메일 클라이언트를 열지 못했습니다:', error);
            vscode.window.showErrorMessage('이메일 클라이언트를 열지 못했습니다');
        }
    }

    private async showFileDialog() {
        const options: vscode.OpenDialogOptions = {
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            openLabel: '파일 선택',
            title: '파일 선택',
            filters: {
                '모든 파일': ['*']
            }
        };
        
        const result = await vscode.window.showOpenDialog(options);
        if (result && result.length > 0) {
            return result.map(uri => uri.fsPath);
        }
        return null;
    }

    private async showFolderDialog() {
        const options: vscode.OpenDialogOptions = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: '폴더 선택',
            title: '폴더 선택'
        };
        
        const result = await vscode.window.showOpenDialog(options);
        if (result && result.length > 0) {
            return result[0].fsPath;
        }
        return null;
    }


    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gemini Code Assistant Korean</title>
    <style>
        body {
            padding: 10px;
            font-family: 'Malgun Gothic', '맑은 고딕', var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
        }
        .container {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .input-container {
            position: relative;
            margin-bottom: 10px;
        }
        textarea {
            width: 100%;
            min-height: 150px;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            font-family: 'Malgun Gothic', '맑은 고딕', var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            resize: vertical;
            box-sizing: border-box;
            line-height: 1.4;
        }
        textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }
        .korean-indicator {
            position: absolute;
            top: 5px;
            right: 5px;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--vscode-descriptionForeground);
            opacity: 0;
            transition: opacity 0.2s;
        }
        .korean-indicator.active {
            opacity: 1;
            background-color: var(--vscode-textLink-foreground);
        }
        .char-counter {
            position: absolute;
            bottom: 5px;
            right: 10px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-editor-background);
            padding: 2px 4px;
            border-radius: 2px;
        }
        .button-container {
            display: flex;
            gap: 5px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }
        button {
            padding: 6px 12px;
            border: none;
            cursor: pointer;
            font-size: 13px;
            border-radius: 5px;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        
        
        /* Flush 버튼 - 부드러운 빨강 */
        .btn-flush {
            background-color: #dc3545;
            color: white;
        }
        .btn-flush:hover {
            background-color: #e85d6b;
            transform: translateY(-1px);
        }
        
        /* Gemini 버튼 - Gemini 색상 (예: 파란색 계열) */
        .btn-gemini {
            background-color: #4285F4; /* Google Blue */
            color: white;
        }
        .btn-gemini:hover {
            background-color: #6a9df6;
            transform: translateY(-1px);
        }
        
        /* File/Folder 버튼 - 기본 VSCode 색상 */
        .btn-file, .btn-folder {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-file:hover, .btn-folder:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }
        

        .flush-option {
            margin-bottom: 10px;
            display: flex;
            align-items: center;
        }
        .flush-checkbox {
            display: flex;
            align-items: center;
            cursor: pointer;
            font-size: 13px;
            color: var(--vscode-foreground);
        }
        .flush-checkbox input[type="checkbox"] {
            margin-right: 8px;
            cursor: pointer;
        }
        .flush-checkbox:hover {
            color: var(--vscode-textLink-foreground);
        }
        .link-container {
            display: flex;
            gap: 8px;
            margin: 20px 0;
            flex-wrap: wrap;
            justify-content: center;
            padding: 15px 0;
            border-top: 1px solid var(--vscode-widget-border);
            border-bottom: 1px solid var(--vscode-widget-border);
            background-color: rgba(255, 255, 255, 0.02);
        }
        
        /* Link 버튼들 - 공통 스타일 */
        .btn-link {
            padding: 8px 16px;
            border: none;
            cursor: pointer;
            font-size: 12px;
            border-radius: 6px;
            font-weight: 500;
            transition: all 0.2s ease;
            min-width: 95px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        

        
        /* Github 버튼 - 어두운 회색 */
        .btn-github {
            background-color: #6c757d;
            color: white;
        }
        .btn-github:hover {
            background-color: #545b62;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        
        /* Email 버튼 - 청록색 */
        .btn-email {
            background-color: #20c997;
            color: white;
        }
        .btn-email:hover {
            background-color: #1aa179;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        .info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
            padding: 8px;
            background-color: var(--vscode-badge-background);
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        
        <div class="input-container">
            <textarea id="inputText" placeholder="Gemini에게 무엇을 도와달라고 할까요? / What can Gemini help you with? (Ctrl+Enter)" autofocus></textarea>
            <div class="korean-indicator" id="koreanIndicator"></div>
            <div class="char-counter" id="charCounter">0자</div>
        </div>
        
        <div class="flush-option">
            <label class="flush-checkbox">
                <input type="checkbox" id="flushCheckbox" checked>
                <span class="checkmark"></span>
                Auto-flush message after send (전송 후 메시지 자동 삭제)
            </label>
        </div>
        
        <div class="button-container">
            <button class="btn-flush" onclick="clearInput()">🗑️ Flush</button>
            <button class="btn-gemini" onclick="newChat()">🤖 Gemini</button>
            <button class="btn-file" onclick="addFile()">📄 Add File</button>
            <button class="btn-folder" onclick="addFolder()">📁 Add Folder</button>

        </div>
        
        <div class="link-container">

            <button class="btn-link btn-github" onclick="openGithub()">🐙 Github</button>
            <button class.btn-link btn-email" onclick="openEmail()">📧 Email</button>
        </div>
        
        <div class="info">
            <strong>-----Shortcut-----</strong><br>
            [Ctrl+Enter] Send unicode type characters to Gemini CLI directly<br><br>
            <strong>-----Patch Notes-----</strong><br>
            1.0.3 : [Ctrl+Enter] Direct input transmission to Gemini Code CLI with auto-enter<br>
            1.0.2 : AI alien plant elimination progress<br>
            1.0.1 : AI bug extermination<br>
            1.0.0 : Initial release<br><br>
            터미널에 한국어 또는 외국어자판이 지연입력되는 문제로 스트레스받아서 개발하였습니다.<br>
            모든 한국어 또는 지연입력되는 외국어 자판을 사용하는 개발자 분들에게 조금이나마 도움 되었으면 합니다.<br><br>
            Developed due to stress from delayed input issues with non-English keyboards.<br>
            Hope this helps all developers who use Korean or other non-English keyboards that experience input delays.
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const textarea = document.getElementById('inputText');
        const charCounter = document.getElementById('charCounter');
        const koreanIndicator = document.getElementById('koreanIndicator');
        
        let isComposing = false;
        
        // 한국어 입력 최적화
        textarea.addEventListener('compositionstart', (e) => {
            isComposing = true;
            koreanIndicator.classList.add('active');
        });
        
        textarea.addEventListener('compositionend', (e) => {
            isComposing = false;
            koreanIndicator.classList.remove('active');
            updateCharCounter();
        });
        
        textarea.addEventListener('input', (e) => {
            if (!isComposing) {
                updateCharCounter();
            }
            // 실시간으로 텍스트 동기화
            vscode.postMessage({
                type: 'updateText',
                value: e.target.value
            });
        });
        
        function updateCharCounter() {
            const length = textarea.value.length;
            charCounter.textContent = length + '자';
        }
        
        function sendToGemini() {
            // 신호만 보내기 (텍스트는 이미 동기화됨)
            if (textarea.value.trim()) {
                const flushCheckbox = document.getElementById('flushCheckbox');
                const shouldFlush = flushCheckbox.checked;
                
                vscode.postMessage({
                    type: 'sendToGemini',
                    shouldFlush: shouldFlush
                });
                
                // 플러시 옵션이 켜져있으면 즉시 클리어
                if (shouldFlush) {
                    textarea.value = '';
                    updateCharCounter();
                    vscode.postMessage({
                        type: 'updateText',
                        value: ''
                    });
                }
            }
        }
        
        function clearInput() {
            textarea.value = '';
            updateCharCounter();
            vscode.postMessage({
                type: 'updateText',
                value: ''
            });
            vscode.postMessage({
                type: 'clearInput'
            });
        }
        
        function newChat() {
            vscode.postMessage({
                type: 'newChat'
            });
        }
        
        function addFile() {
            vscode.postMessage({
                type: 'addFile'
            });
        }
        
        function addFolder() {
            vscode.postMessage({
                type: 'addFolder'
            });
        }
        
        function autoMode() {
            vscode.postMessage({
                type: 'autoMode'
            });
        }
        
        function openBugReport() {
            vscode.postMessage({
                type: 'openBugReport'
            });
        }
        
        function openGithub() {
            vscode.postMessage({
                type: 'openGithub'
            });
        }
        
        function openEmail() {
            vscode.postMessage({
                type: 'openEmail'
            });
        }
        
        
        // Ctrl+Enter (Windows) / Cmd+Enter (macOS) 단축키
        textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                sendToGemini();
            }
        });
        
        // 웹뷰 메시지 수신
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'clear':
                    textarea.value = '';
                    updateCharCounter();
                    break;
                case 'addText':
                    textarea.value = message.value;
                    updateCharCounter();
                    textarea.focus();
                    break;
                case 'focusInput':
                    textarea.focus();
                    break;
            }
        });
        
        // 초기화
        updateCharCounter();
        textarea.focus();
    </script>
</body>
</html>`;
    }
}

function deactivate() {
    // 모든 Gemini 터미널 정리
    const terminals = vscode.window.terminals;
    terminals.forEach(terminal => {
        if (terminal.name === 'Gemini' || terminal.name.includes('gemini')) {
            terminal.dispose();
        }
    });
    
    currentGeminiTerminal = undefined;
}

export { activate, deactivate };