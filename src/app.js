const { ethers, utils } = window.ethers;

 // Unpkg imports
const Web3Modal = window.Web3Modal.default;
const WalletConnectProvider = window.WalletConnectProvider.default;
const Fortmatic = window.Fortmatic;
const evmChains = window.evmChains;
const LightweightCharts = window.LightweightCharts;

// Web3modal instance
let web3Modal
let provider;
let web3ModalProvider;

let chart;
let lineSeries;
let chartData = [];


let selectedAccount;

let token1 = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
let token2 = '0xdac17f958d2ee523a2206206994597c13d831ec7';

let token1Decimals = 18;
let token2Decimals = 18;

const FACTORY_ADDRESS = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const BLOCKS_COUNT = 500;

let pairAddress = '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc';

/**
 * Setup the orchestra
 */

class BigDecimal {
  static decimals = 16;
  constructor(value) {
      let [ints, decis] = String(value).split(".").concat("");
      decis = decis.padEnd(BigDecimal.decimals, "0");
      this.bigint = BigInt(ints + decis);
  }
  static fromBigInt(bigint) {
      return Object.assign(Object.create(BigDecimal.prototype), { bigint });
  }
  divide(divisor) { // You would need to provide methods for other operations
      return BigDecimal.fromBigInt(this.bigint * BigInt("1" + "0".repeat(BigDecimal.decimals)) / divisor.bigint);
  }
  toString() {
      const s = this.bigint.toString().padStart(BigDecimal.decimals+1, "0");
      return s.slice(0, -BigDecimal.decimals) + "." + s.slice(-BigDecimal.decimals)
              .replace(/\.?0+$/, "");
  }
}

async function init() {

  console.log("WalletConnectProvider is", WalletConnectProvider);
  console.log("window.web3 is", window.web3, "window.ethereum is", window.ethereum);

  // Tell Web3modal what providers we have available.
  // Built-in web browser provider (only one can exist as a time)
  // like MetaMask, Brave or Opera is added automatically by Web3modal
  const providerOptions = {
    walletconnect: {
      package: WalletConnectProvider,
      options: {
        infuraId: "86e084f647d44d1d81e69a8cb07b98a7",
      }
    },
  };

  web3Modal = new Web3Modal({
    cacheProvider: false, // optional
    providerOptions, // required
    disableInjectedProvider: false, // optional. For MetaMask / Brave / Opera.
  });
  drawGraph();

}


/**
 * Kick in the UI action after Web3modal dialog has chosen a provider
 */
async function fetchAccountData() {

  // Get a Web3 instance for the wallet
  const web3 = new Web3(web3ModalProvider);
  provider = new ethers.providers.Web3Provider(web3ModalProvider);

  console.log("Web3 instance is", web3);

  // Get connected chain id from Ethereum node
  const chainId = await web3.eth.getChainId();
  // Load chain information over an HTTP API
  const chainData = evmChains.getChain(chainId);
  document.querySelector("#network-name").textContent = chainData.name;

  // Get list of accounts of the connected wallet
  const accounts = await web3.eth.getAccounts();

  // MetaMask does not give you all accounts, only the selected account
  console.log("Got accounts", accounts);
  selectedAccount = accounts[0];

  document.querySelector("#selected-account").textContent = selectedAccount;

  // Display fully loaded UI for wallet data
  document.querySelector("#prepare").style.display = "none";
  document.querySelector("#connected").style.display = "block";
}



/**
 * Fetch account data for UI when
 * - User switches accounts in wallet
 * - User switches networks in wallet
 * - User connects wallet initially
 */
async function refreshAccountData() {

  // If any current data is displayed when
  // the user is switching acounts in the wallet
  // immediate hide this data
  document.querySelector("#connected").style.display = "none";
  document.querySelector("#prepare").style.display = "block";

  // Disable button while UI is loading.
  // fetchAccountData() will take a while as it communicates
  // with Ethereum node via JSON-RPC and loads chain data
  // over an API call.
  document.querySelector("#btn-connect").setAttribute("disabled", "disabled")
  await fetchAccountData(web3ModalProvider);
  document.querySelector("#btn-connect").removeAttribute("disabled")
}


/**
 * Connect wallet button pressed.
 */
async function onConnect() {

  console.log("Opening a dialog", web3Modal);
  try {
    web3ModalProvider = await web3Modal.connect();
  } catch(e) {
    console.log("Could not get a wallet connection", e);
    return;
  }

  // Subscribe to accounts change
  web3ModalProvider.on("accountsChanged", (accounts) => {
    fetchAccountData();
  });

  // Subscribe to chainId change
  web3ModalProvider.on("chainChanged", (chainId) => {
    fetchAccountData();
  });

  // Subscribe to networkId change
  web3ModalProvider.on("networkChanged", (networkId) => {
    fetchAccountData();
  });

  await refreshAccountData();
}

/**
 * Disconnect wallet button pressed.
 */
async function onDisconnect() {

  console.log("Killing the wallet connection", web3ModalProvider);

  // TODO: Which providers have close method?
  if(web3ModalProvider.close) {
    await web3ModalProvider.close();

    // If the cached provider is not cleared,
    // WalletConnect will default to the existing session
    // and does not allow to re-scan the QR code with a new wallet.
    // Depending on your use case you may want or want not his behavir.
    await web3Modal.clearCachedProvider();
    web3ModalProvider = null;
  }

  selectedAccount = null;

  // Set the UI back to the initial state
  document.querySelector("#prepare").style.display = "block";
  document.querySelector("#connected").style.display = "none";
}

async function onChangeNetwork() {
    provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
        chainId: '0x38',
        chainName: 'Binance Smart Chain',
        nativeCurrency: {
            name: 'Binance Coin',
            symbol: 'BNB',
            decimals: 18
        },
        rpcUrls: ['https://bsc-dataseed.binance.org/'],
        blockExplorerUrls: ['https://bscscan.com']
        }]
        })
        .catch((error) => {
        console.log(error)
        }) 
}

async function onSelectToken(evt) {
  evt.preventDefault();
  
  chartData = [];
  provider.off('block');

  const token1 = document.querySelector("#select-token input[name='token1']").value;
  const token2 = document.querySelector("#select-token input[name='token2']").value;

  const factoryFile = await fetch('https://super-vic114.github.io/LiquidityGraph/contracts/uniswap-factory.abi.json');
  const factoryAbi = await factoryFile.json();
  const signer = provider.getSigner();
  const factory = new ethers.Contract(FACTORY_ADDRESS, factoryAbi, signer);

  const res = await factory.getPair(token1, token2);
  pairAddress = res;

  console.log({ pairAddress });

  // Get Uniswap LP Contract ABI
  const lpFile = await fetch('https://super-vic114.github.io/LiquidityGraph/contracts/uniswap-lp.abi.json');
  const lpAbi = await lpFile.json();
  const contract = new ethers.Contract(pairAddress, lpAbi, signer);

  await getDecimals(contract);
  await getChartData(contract);
  
};

async function getChartData(contract) {

  try {
      // Get historical data from local storage.
      // Will be replaced to get from Node.js server
      const data = JSON.parse(window.localStorage.getItem(pairAddress));
      const lastBlockNumber = data ? data.at(-1).block : 0;
      
      if (data) chartData = data.sort((a, b) => a.block - b.block);
      


      // Get recent block number
      const startBlock = await provider.getBlockNumber();

      let i = 1;

      // Initialize Loop Values
      let maxBlocks = startBlock - lastBlockNumber;
      if (maxBlocks > BLOCKS_COUNT) {
        maxBlocks = BLOCKS_COUNT;
        chartData = [];
      }
      const progresEl = document.getElementById('progress');
      while(i < maxBlocks) {

        // Calculate price from getReserves() function
        const res = await contract.getReserves({ blockTag: startBlock - maxBlocks + i });
        console.log(`${startBlock - maxBlocks + i}:`, res);
        const price = Number(res._reserve0) / Number(res._reserve1) * Math.pow(10, token2Decimals - token1Decimals);
        const index = chartData.findIndex(el => el.time == res._blockTimestampLast);

        if (index >= 0) {
          chartData[index].value = price;
          chartData[index].block = startBlock - maxBlocks + i;
        } else {
          chartData.push({ block: startBlock - maxBlocks + i, time: res[2], value: price });
        }
        progresEl.innerHTML = `Fetching Data From Contract - ${i / maxBlocks * 100}%`;
        i ++;
      }
      progresEl.innerHTML = ``;

      // Save to local storage
      chartData = chartData.slice(-1000);
      const sortArr = chartData.sort((a, b) => a.block - b.block);
      
      console.log(chartData);
      
      setTimeout(() => {
        window.localStorage.setItem(pairAddress, JSON.stringify(sortArr));
        lineSeries.setData(sortArr); 
      }, 100);
      // Update chart on every new block

      provider.on("block", blockNumber => onBlock(contract, blockNumber));
  } catch (e) {
      console.log(e);
  }
}

async function onBlock(contract, blockNumber) {
  // Emitted on every block change
  // Caculate price
  const res = await contract.getReserves({ blockTag: blockNumber });
  const price = Number(res._reserve0) / Number(res._reserve1) * Math.pow(10, token2Decimals - token1Decimals);
  console.log(`${blockNumber}:`, res);
  // Update price with same timestamp
  const index = chartData.findIndex(el => el.time == res._blockTimestampLast);
  
  if (index >= 0) {
    chartData[index].value = price;
    chartData[index].block = blockNumber;
  } else {
    chartData.push({ block: blockNumber, time: res[2], value: price });
  }

  // Sort data array by block number
  const sortArr = chartData.sort((a, b) => a.block - b.block);
  console.log(chartData);

  setTimeout(() => {
    window.localStorage.setItem(pairAddress, JSON.stringify(sortArr));  
    lineSeries.setData(sortArr);
  }, 100);
  
}

/**
 * Calculate decimals for tokens to get correct reserves
 */

async function getDecimals(lpContract) {
  
  // Get token addresses
  const token1Address = await lpContract.token0();
  const token2Address = await lpContract.token1();

  // Create each token contract instance to get decimals
  const file = await fetch('https://super-vic114.github.io/LiquidityGraph/contracts/erc20.abi.json');
  const abi = await file.json();
  
  const signer = provider.getSigner();

  const token1Contract = new ethers.Contract(token1Address, abi, signer);
  const token2Contract = new ethers.Contract(token2Address, abi, signer);

  token1Decimals = await token1Contract.decimals();
  token2Decimals = await token2Contract.decimals();

  console.log({ token1Decimals, token2Decimals });
}

function drawGraph() {
  chart = LightweightCharts.createChart(document.getElementById('chart'), { 
    width: 980, 
    height: 610,
    timeScale: {
      timeVisible: true,
      secondVisible: true
    },
  });
  lineSeries = chart.addLineSeries();
  
  lineSeries.applyOptions({
    priceFormat: {
        type: 'price',
        precision: 6,
        minMove: 0.00001,
    },
  });

}

/**
 * Main entry point.
 */
window.addEventListener('load', async () => {
  init();
  document.querySelector("#btn-connect").addEventListener("click", onConnect);
  document.querySelector("#btn-disconnect").addEventListener("click", onDisconnect);
  // document.querySelector("#select-token").addEventListener("submit", onSelectToken);
});
