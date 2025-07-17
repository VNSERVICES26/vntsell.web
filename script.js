const CONFIG = {
    testnet: {
        vntSwapAddress: "0x47384c655bCbC92DEd1133c4AE0Bd7708B7e6f4F", // REPLACE WITH YOUR TESTNET SWAP CONTRACT ADDRESS
        vntTokenAddress: "0xa7e41CB0A41dbFC801408d3B577fCed150c4eeEc", // REPLACE WITH YOUR TESTNET VNT TOKEN ADDRESS
        usdtTokenAddress: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd", // REPLACE WITH YOUR TESTNET USDT TOKEN ADDRESS
        chainId: "0x61", // BSC Testnet Chain ID
        rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545/"
    }
};

// ERC20 ABI (Minimum required functions)
const ERC20_ABI = [
    {
        "constant": true,
        "inputs": [{"name": "owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"}
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"}
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function"
    }
];

// VNTBuy कॉन्ट्रैक्ट ABI
const VNT_BUY_ABI = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "vntAmount", "type": "uint256"}
        ],
        "name": "sellVNT",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "minSell",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getPricePerVNT",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "vntAmount", "type": "uint256"}],
        "name": "getQuote",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "vntToken",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "buyerWallet",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    }
];

let web3;
let swapContract;
let vntToken;
let usdtToken;
let currentAccount = null;
let minSellAmount = 0;
let vntDecimals = 18;
let usdtDecimals = 18;

window.addEventListener('load', async () => {
    try {
        await setupEventListeners();
        await checkWalletConnection();
        await initContracts();
        setupInputListener();
        updateUI();
    } catch (error) {
        console.error("Initialization error:", error);
        showMessage(`Initialization failed: ${error.message}`, 'error');
    }
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
        showMessage(`Quote failed: ${error.message}`, 'error');
        document.getElementById('quoteResult').classList.add('hidden');
    }
}

async function checkWalletConnection() {
    if (window.ethereum) {
        try {
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (chainId !== CONFIG.testnet.chainId) {
                console.log("User is not on Testnet");
                return;
            }
            
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                currentAccount = accounts[0];
                setupWalletEvents();
            }
        } catch (error) {
            console.error("Error checking wallet:", error);
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

async function switchToTestnet() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CONFIG.testnet.chainId }],
        });
        return true;
    } catch (error) {
        if (error.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: CONFIG.testnet.chainId,
                        chainName: 'Binance Smart Chain Testnet',
                        nativeCurrency: {
                            name: 'BNB',
                            symbol: 'BNB',
                            decimals: 18
                        },
                        rpcUrls: [CONFIG.testnet.rpcUrl],
                        blockExplorerUrls: ['https://testnet.bscscan.com/']
                    }]
                });
                return true;
            } catch (addError) {
                console.error("Failed to add Testnet:", addError);
                return false;
            }
        }
        console.error("Failed to switch to Testnet:", error);
        return false;
    }
}

async function connectWallet() {
    if (!window.ethereum) {
        showMessage('Please install MetaMask or another Web3 wallet', 'error');
        return;
    }

    try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (chainId !== CONFIG.testnet.chainId) {
            const switched = await switchToTestnet();
            if (!switched) {
                showMessage('Please switch to BSC Testnet', 'error');
                return;
            }
        }

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        currentAccount = accounts[0];
        setupWalletEvents();
        
        // Initialize contracts if not already done
        if (!vntToken) {
            await initContracts();
        }
        
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
        // पहले Web3 को initialize करें
        if (window.ethereum) {
            web3 = new Web3(window.ethereum);
        } else {
            web3 = new Web3(new Web3.providers.HttpProvider(CONFIG.testnet.rpcUrl));
        }

        // एड्रेस वैलिडेशन
        const config = CONFIG.testnet;
        if (!web3.utils.isAddress(config.vntSwapAddress)) {
            throw new Error("Invalid VNT Swap contract address");
        }
        if (!web3.utils.isAddress(config.vntTokenAddress)) {
            throw new Error("Invalid VNT Token address");
        }
        if (!web3.utils.isAddress(config.usdtTokenAddress)) {
            throw new Error("Invalid USDT Token address");
        }

        // कॉन्ट्रैक्ट initialize करें
        swapContract = new web3.eth.Contract(VNT_BUY_ABI, config.vntSwapAddress);
        vntToken = new web3.eth.Contract(ERC20_ABI, config.vntTokenAddress);
        usdtToken = new web3.eth.Contract(ERC20_ABI, config.usdtTokenAddress);

        // कॉन्ट्रैक्ट डेटा लोड करें
        minSellAmount = await swapContract.methods.minSell().call();
        vntDecimals = await vntToken.methods.decimals().call();
        usdtDecimals = await usdtToken.methods.decimals().call();

        document.getElementById('minSellAmount').textContent = formatUnits(minSellAmount, vntDecimals) + ' VNT';
        
        await loadContractData();
    } catch (error) {
        console.error("Contract initialization error:", error);
        showMessage(`Contract init failed: ${error.message}`, 'error');
        throw error;
    }
}

async function loadContractData() {
    try {
        const price = await swapContract.methods.getPricePerVNT().call();
        document.getElementById('vntPrice').textContent = `${formatUnits(price, 18)} USDT`;
        
        const buyerWallet = await swapContract.methods.buyerWallet().call();
        const availableUSDT = await usdtToken.methods.balanceOf(buyerWallet).call();
        document.getElementById('availableUSDT').textContent = `${formatUnits(availableUSDT, usdtDecimals)} USDT`;
        
        document.getElementById('vntContract').textContent = await swapContract.methods.vntToken().call();
    } catch (error) {
        console.error("Error loading contract data:", error);
        showMessage(`Error loading contract data: ${error.message}`, 'error');
    }
}

async function checkApprovalStatus(vntAmount) {
    try {
        if (!web3.utils.isAddress(CONFIG.testnet.vntSwapAddress)) {
            throw new Error("Invalid contract address");
        }
        
        if (!currentAccount || !web3.utils.isAddress(currentAccount)) {
            throw new Error("Invalid wallet address");
        }

        if (!vntAmount || web3.utils.toBN(vntAmount).lt(web3.utils.toBN(minSellAmount))) {
            return false;
        }
        
        const currentAllowance = await vntToken.methods.allowance(
            currentAccount, 
            CONFIG.testnet.vntSwapAddress
        ).call();
        
        return web3.utils.toBN(currentAllowance).gte(web3.utils.toBN(vntAmount));
    } catch (error) {
        console.error('Approval check error:', error);
        showMessage(`Approval check failed: ${error.message}`, 'error');
        return false;
    }
}

async function approveVNT() {
    try {
        if (!currentAccount) {
            showMessage('Please connect your wallet first', 'error');
            return;
        }

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
                CONFIG.testnet.vntSwapAddress,
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
        const receipt = await transactionPromise;
        
        const txHash = receipt.transactionHash;
        const txLink = `https://testnet.bscscan.com/tx/${txHash}`;
        
        const successMsg = `${successMessage} <a href="${txLink}" target="_blank" style="color: var(--secondary-color);">(View on BSCScan)</a>`;
        showMessage(successMsg, 'success');
    } catch (error) {
        if (error.code === 4001) {
            showMessage('User rejected transaction', 'error');
        } else {
            showMessage(`Transaction failed: ${error.message}`, 'error');
        }
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
    messageElement.innerHTML = message;
    messageElement.classList.add(`${type}-message`);
    statusDiv.appendChild(messageElement);
    setTimeout(() => messageElement.remove(), 5000);
}
