const CONFIG = {
    mainnet: {
        vntSwapAddress: "0x0....", 
        vntTokenAddress: "0x0....", 
        usdtTokenAddress: "0x0....", 
        chainId: "0x38", // BSC Mainnet chain ID
        rpcUrl: "https://bsc-dataseed.binance.org/"
    }
};

let web3;
let swapContract;
let vntToken;
let usdtToken;
let currentAccount = null;
let minSellAmount = 0;
let vntDecimals = 18;
let usdtDecimals = 18;

window.addEventListener('load', async () => {
    await setupEventListeners();
    await checkWalletConnection();
    await initContracts();
    setupInputListener();
    updateUI();
});

async function setupEventListeners() {
    document.getElementById('connectWalletBtn').addEventListener('click', connectWallet);
    document.getElementById('approveBtn').addEventListener('click', approveVNT);
    document.getElementById('sellBtn').addEventListener('click', sellVNT);
    document.getElementById('copyContractBtn').addEventListener('click', copyContractAddress);
}

function setupInputListener() {
    const vntAmountInput = document.getElementById('vntAmount');
    vntAmountInput.addEventListener('input', async () => {
        if (currentAccount) {
            await calculateQuote();
        }
    });
}

function toTokenUnits(amount, decimals = 18) {
    return web3.utils.toBN(amount).mul(web3.utils.toBN(10).pow(web3.utils.toBN(decimals)));
}

async function calculateQuote() {
    try {
        const vntAmountInput = document.getElementById('vntAmount').value;
        
        if (!vntAmountInput || isNaN(vntAmountInput)) {
            document.getElementById('quoteResult').classList.add('hidden');
            return;
        }
        
        const vntAmount = toTokenUnits(vntAmountInput, vntDecimals);
        const minSell = web3.utils.toBN(minSellAmount);
        
        if (vntAmount.lt(minSell)) {
            document.getElementById('quoteResult').classList.add('hidden');
            return;
        }
        
        const usdtAmount = await swapContract.methods.getQuote(vntAmount.toString()).call();
        
        document.getElementById('usdtAmount').textContent = formatUnits(usdtAmount, usdtDecimals);
        document.getElementById('quoteResult').classList.remove('hidden');
        
        const isApproved = await checkApprovalStatus(vntAmount.toString());
        document.getElementById('approveBtn').disabled = isApproved;
        document.getElementById('sellBtn').disabled = !isApproved;
        
    } catch (error) {
        console.error('Quote calculation error:', error);
        document.getElementById('quoteResult').classList.add('hidden');
    }
}

async function checkWalletConnection() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                currentAccount = accounts[0];
                setupWalletEvents();
            }
        } catch (error) {
            console.error("Error checking wallet connection:", error);
        }
    }
}

function setupWalletEvents() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            currentAccount = accounts.length > 0 ? accounts[0] : null;
            updateUI();
            if (currentAccount) calculateQuote();
        });
        
        window.ethereum.on('chainChanged', () => {
            window.location.reload();
        });
        
        window.ethereum.on('disconnect', (error) => {
            console.log('Wallet disconnected:', error);
            currentAccount = null;
            updateUI();
        });
    }
}

async function connectWallet() {
    if (!window.ethereum) {
        showMessage('Please install MetaMask or another Web3 wallet', 'error');
        return;
    }

    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        currentAccount = accounts[0];
        setupWalletEvents();
        
        const vntBalance = await vntToken.methods.balanceOf(currentAccount).call();
        
        document.getElementById('walletAddress').textContent = shortenAddress(currentAccount);
        document.getElementById('vntBalance').textContent = formatUnits(vntBalance, vntDecimals);
        document.getElementById('walletInfo').classList.remove('hidden');
        
        showMessage('Wallet connected successfully', 'success');
        updateUI();
        await calculateQuote();
    } catch (error) {
        if (error.code === 4001) {
            showMessage('User rejected connection request', 'error');
        } else {
            showMessage(`Error connecting wallet: ${error.message}`, 'error');
        }
    }
}

async function initContracts() {
    try {
        const config = CONFIG.mainnet;
        web3 = new Web3(window.ethereum || config.rpcUrl);
        
        const swapABI = [ ];
        const tokenABI = [ ];

        swapContract = new web3.eth.Contract(swapABI, config.vntSwapAddress);
        vntToken = new web3.eth.Contract(tokenABI, config.vntTokenAddress);
        usdtToken = new web3.eth.Contract(tokenABI, config.usdtTokenAddress);
        
        minSellAmount = await swapContract.methods.minSell().call();
        vntDecimals = await vntToken.methods.decimals().call();
        usdtDecimals = await usdtToken.methods.decimals().call();
        
        document.getElementById('minSellAmount').textContent = formatUnits(minSellAmount, vntDecimals) + ' VNT';
        
        await loadContractData();
    } catch (error) {
        showMessage(`Error initializing contracts: ${error.message}`, 'error');
    }
}

async function loadContractData() {
    try {
        const price = await swapContract.methods.getPricePerVNT().call();
        document.getElementById('vntPrice').textContent = `${formatUnits(price, 18)} USDT`;
        
        document.getElementById('vntContract').textContent = await swapContract.methods.vntToken().call();
    } catch (error) {
        showMessage(`Error loading contract data: ${error.message}`, 'error');
    }
}

async function checkApprovalStatus(vntAmount) {
    try {
        if (!vntAmount || web3.utils.toBN(vntAmount).lt(web3.utils.toBN(minSellAmount))) {
            return false;
        }
        
        const currentAllowance = await vntToken.methods.allowance(
            currentAccount, 
            CONFIG.mainnet.vntSwapAddress
        ).call();
        
        return web3.utils.toBN(currentAllowance).gte(web3.utils.toBN(vntAmount));
    } catch (error) {
        console.error('Approval check error:', error);
        return false;
    }
}

async function approveVNT() {
    try {
        const vntAmountInput = document.getElementById('vntAmount').value;
        if (!vntAmountInput || isNaN(vntAmountInput)) {
            showMessage('Please enter a valid VNT amount', 'error');
            return;
        }
        
        const vntAmount = toTokenUnits(vntAmountInput, vntDecimals);
        
        if (vntAmount.lt(web3.utils.toBN(minSellAmount))) {
            showMessage(`Minimum sale is ${formatUnits(minSellAmount, vntDecimals)} VNT`, 'error');
            return;
        }
        
        await handleTransaction(
            vntToken.methods.approve(
                CONFIG.mainnet.vntSwapAddress,
                vntAmount.toString()
            ).send({ from: currentAccount }),
            'VNT approved successfully!'
        );
        
        document.getElementById('approveBtn').disabled = true;
        document.getElementById('sellBtn').disabled = false;
    } catch (error) {
        if (error.code === 4001) {
            showMessage('User rejected transaction', 'error');
        } else {
            showMessage(`Approval failed: ${error.message}`, 'error');
        }
    }
}

async function sellVNT() {
    try {
        const vntAmountInput = document.getElementById('vntAmount').value;
        if (!vntAmountInput || isNaN(vntAmountInput)) {
            showMessage('Please enter a valid VNT amount', 'error');
            return;
        }
        
        const vntAmount = toTokenUnits(vntAmountInput, vntDecimals);
        
        if (vntAmount.lt(web3.utils.toBN(minSellAmount))) {
            showMessage(`Minimum sale is ${formatUnits(minSellAmount, vntDecimals)} VNT`, 'error');
            return;
        }
        
        await handleTransaction(
            swapContract.methods.sellVNT(vntAmount.toString()).send({ from: currentAccount }),
            'VNT sold successfully!'
        );
        
        await loadContractData();
        updateUI();
    } catch (error) {
        if (error.code === 4001) {
            showMessage('User rejected transaction', 'error');
        } else {
            showMessage(`Sale failed: ${error.message}`, 'error');
        }
    }
}

async function handleTransaction(transactionPromise, successMessage) {
    try {
        showMessage('Processing transaction...', 'status');
        await transactionPromise;
        showMessage(successMessage, 'success');
    } catch (error) {
        throw error;
    }
}

function copyContractAddress() {
    const address = document.getElementById('vntContract').textContent;
    navigator.clipboard.writeText(address);
    showMessage('Contract address copied!', 'success');
}

function updateUI() {
    const isConnected = currentAccount !== null;
    document.getElementById('connectWalletBtn').textContent = isConnected ? 'Connected' : 'Connect Wallet';
    document.getElementById('walletInfo').classList.toggle('hidden', !isConnected);
    
    document.getElementById('approveBtn').disabled = !isConnected;
    document.getElementById('sellBtn').disabled = true;
}

function formatUnits(value, decimals) {
    return (value / 10 ** decimals).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: decimals
    });
}

function shortenAddress(address) {
    return address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : '';
}

function showMessage(message, type = 'status') {
    const statusDiv = document.getElementById('statusMessages');
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.classList.add(`${type}-message`);
    statusDiv.appendChild(messageElement);
    setTimeout(() => messageElement.remove(), 5000);
}
