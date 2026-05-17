import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  FileDown, 
  FileSpreadsheet, 
  Loader2, 
  Filter,
  X,
  MessageCircle,
  Database,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate, cn, cleanPhoneNumber } from '../lib/utils';

export const Reports: React.FC = () => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [automationStatus, setAutomationStatus] = useState<any>(null);
  const [deliveryProgress, setDeliveryProgress] = useState<{ step: string, status: 'idle' | 'loading' | 'success' | 'error' } | null>(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('all');

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

  useEffect(() => {
    const unsubAutomation = onSnapshot(doc(db, 'settings', 'automated_reports'), (snapshot) => {
      if (snapshot.exists()) {
        setAutomationStatus(snapshot.data());
      }
    });

    const unsubscribeTxs = onSnapshot(query(collection(db, 'transactions'), orderBy('timestamp', 'desc')), (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubscribeCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => {
      unsubAutomation();
      unsubscribeTxs();
      unsubscribeCustomers();
    };
  }, []);

  // Derived Data
  const filteredTransactions = useMemo(() => {
    let txs = [...transactions];
    if (filterCustomerId !== 'all') {
      txs = txs.filter(t => t.customerId === filterCustomerId);
    }
    if (dateRange.start) {
      txs = txs.filter(t => t.date >= dateRange.start);
    }
    if (dateRange.end) {
      txs = txs.filter(t => t.date <= dateRange.end);
    }
    return txs;
  }, [transactions, filterCustomerId, dateRange]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const monthStr = now.toISOString().slice(0, 7);

    const filtered = filteredTransactions;
    const totalIn = filtered.filter(t => t.type === 'in').reduce((acc, t) => acc + t.amount, 0);
    const totalOut = filtered.filter(t => t.type === 'out').reduce((acc, t) => acc + t.amount, 0);
    
    // Global stats
    const todayIn = transactions.filter(t => t.date === todayStr && t.type === 'in').reduce((acc, t) => acc + t.amount, 0);
    const monthIn = transactions.filter(t => t.date?.startsWith(monthStr) && t.type === 'in').reduce((acc, t) => acc + t.amount, 0);

    return {
      in: totalIn,
      out: totalOut,
      balance: totalIn - totalOut,
      todayIn,
      monthIn,
      count: filtered.length,
      customerCount: new Set(filtered.map(t => t.customerId)).size
    };
  }, [filteredTransactions, transactions]);

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || 'Unknown';

  const formatPDFCurrency = (amount: number) => {
    const formatted = new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));
    return `Rs ${formatted}`;
  };

  const exportToExcel = async (shareMode = false) => {
    setLoading(true);
    try {
      const wb = XLSX.utils.book_new();

      // 1. Dashboard Info
      const dashboardInfo = [
        { Metric: 'COMPANY NAME', Value: 'CASHFLOW MANAGER PRO' },
        { Metric: 'REPORT TITLE', Value: 'FINANCIAL PERFORMANCE SUMMARY' },
        { Metric: 'GENERATED ON', Value: new Date().toLocaleString() },
        { Metric: 'REPORT PERIOD', Value: `${dateRange.start || 'Beginning'} to ${dateRange.end || 'Today'}` },
        { Metric: '', Value: '' },
        { Metric: '--- SUMMARY TOTALS ---', Value: '' },
        { Metric: 'TOTAL CASH IN (+)', Value: stats.in },
        { Metric: 'TOTAL CASH OUT (-)', Value: stats.out },
        { Metric: 'NET BALANCE', Value: stats.balance },
        { Metric: 'TODAY COLLECTION', Value: stats.todayIn },
        { Metric: 'MONTHLY COLLECTION', Value: stats.monthIn },
        { Metric: 'TOTAL CUSTOMERS', Value: stats.customerCount },
        { Metric: 'TOTAL TRANSACTIONS', Value: stats.count },
      ];
      const wsDash = XLSX.utils.json_to_sheet(dashboardInfo);
      XLSX.utils.book_append_sheet(wb, wsDash, "DASHBOARD");

      // 2. Transaction Journal
      const journalData = filteredTransactions.map((tx, idx) => ({
        'Entry ID': tx.id?.slice(-6).toUpperCase() || `TX-${idx + 1}`,
        Date: tx.date,
        Time: tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString() : '-',
        'Customer Name': getCustomerName(tx.customerId),
        'Type': tx.type === 'in' ? 'CASH IN' : 'CASH OUT',
        Category: tx.category || 'General',
        Amount: tx.amount,
        'Staff': tx.staffName || 'System',
        Description: tx.description || '-'
      }));
      const wsJournal = XLSX.utils.json_to_sheet(journalData);
      XLSX.utils.book_append_sheet(wb, wsJournal, "MASTER_JOURNAL");

      // 3. Customer Directory
      const customerDir = customers.map(c => ({
        'ID': c.id?.slice(-6).toUpperCase(),
        'Name': c.name,
        'Mobile': c.phone || 'N/A',
        'Lifetime In': c.totalIn || 0,
        'Lifetime Out': c.totalOut || 0,
        'Outstanding Balance': c.balance || 0
      }));
      const wsCust = XLSX.utils.json_to_sheet(customerDir);
      XLSX.utils.book_append_sheet(wb, wsCust, "CUSTOMER_LIST");

      // 4. Individual Customer Ledgers
      customers.forEach(customer => {
        const custTxs = transactions.filter(t => t.customerId === customer.id);
        if (custTxs.length > 0) {
          const data = custTxs.map(tx => ({
            Date: tx.date,
            Type: tx.type.toUpperCase(),
            Category: tx.category || 'General',
            Description: tx.description,
            'In': tx.type === 'in' ? tx.amount : 0,
            'Out': tx.type === 'out' ? tx.amount : 0,
          }));
          const ws = XLSX.utils.json_to_sheet(data);
          const safeName = customer.name.substring(0, 31).replace(/[\\?*\/\[\]]/g, '_');
          XLSX.utils.book_append_sheet(wb, ws, safeName);
        }
      });

      const fileName = `CashFlow_Financial_Report_${new Date().toISOString().split('T')[0]}.xlsx`;

      if (shareMode) {
        const excelBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        await handleDirectShare(excelBase64, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        XLSX.writeFile(wb, fileName);
      }
    } catch (error) {
      console.error("Excel Export Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async (shareMode = false) => {
    setLoading(true);
    try {
      const doc = new jsPDF() as any;
      const pageWidth = doc.internal.pageSize.width;
      
      doc.setFont("helvetica", "normal");

      // Professional Branding Header
      doc.setFillColor(15, 23, 42); 
      doc.rect(0, 0, pageWidth, 45, 'F');
      
      doc.setFontSize(26);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.text("CASHFLOW MANAGER", 15, 25);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(160, 160, 160);
      doc.text("CERTIFIED FINANCIAL REPORT & AUDIT STATEMENT", 15, 33);
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`REF: CF-${Date.now().toString().slice(-6)}`, pageWidth - 65, 20);
      doc.text(`DATE: ${new Date().toLocaleDateString()}`, pageWidth - 65, 26);
      doc.text(`TIME: ${new Date().toLocaleTimeString()}`, pageWidth - 65, 32);

      // Summary Dashboard
      const cardWidth = (pageWidth - 40) / 3;
      const cardY = 55;
      
      const drawInfoCard = (x: number, title: string, value: string, color: [number, number, number]) => {
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, cardY, cardWidth, 35, 4, 4, 'F');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(title, x + 5, cardY + 10);
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...color);
        doc.text(value, x + 5, cardY + 25);
      };

      drawInfoCard(15, "TOTAL CASH INFLOW", formatPDFCurrency(stats.in), [16, 185, 129]);
      drawInfoCard(15 + cardWidth + 5, "TOTAL CASH OUTFLOW", formatPDFCurrency(stats.out), [239, 68, 68]);
      drawInfoCard(15 + (cardWidth + 5) * 2, "NET BUSINESS FLOW", formatPDFCurrency(stats.balance), [15, 23, 42]);

      // Metrics Row
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`TODAY'S IN: ${formatPDFCurrency(stats.todayIn)}`, 15, 100);
      doc.text(`THIS MONTH: ${formatPDFCurrency(stats.monthIn)}`, 75, 100);
      doc.text(`ENTRIES: ${stats.count}`, 135, 100);
      doc.text(`CLIENTS: ${stats.customerCount}`, 175, 100);

      const tableData = filteredTransactions.map((tx, idx) => [
        tx.id?.slice(-4).toUpperCase() || `${idx+1}`,
        tx.date,
        getCustomerName(tx.customerId),
        tx.category || 'Gen',
        tx.type === 'in' ? `+${formatPDFCurrency(tx.amount)}` : `-${formatPDFCurrency(tx.amount)}`,
        tx.description || '-'
      ]);

      autoTable(doc, {
        startY: 108,
        head: [['ID', 'Date', 'Customer', 'Cat', 'Amount', 'Remarks']],
        body: tableData,
        headStyles: { 
          fillColor: [15, 23, 42], 
          textColor: [255, 255, 255],
          fontSize: 10,
          fontStyle: 'bold'
        },
        bodyStyles: { fontSize: 9, textColor: [30, 41, 59], cellPadding: 3 },
        columnStyles: {
          4: { fontStyle: 'bold', halign: 'right' }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 15, right: 15 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            const val = data.cell.text[0];
            if (val.startsWith('+')) data.cell.styles.textColor = [5, 150, 105];
            if (val.startsWith('-')) data.cell.styles.textColor = [220, 38, 38];
          }
        }
      });

      // Customer-wise Detailed Section
      let finalY = (doc as any).lastAutoTable.finalY + 20;

      doc.addPage();
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.text("CUSTOMER-WISE DETAILED STATEMENTS", 15, 13);
      
      finalY = 30;

      customers.forEach((customer) => {
        const catTxs = transactions.filter(t => t.customerId === customer.id);
        if (catTxs.length > 0) {
          if (finalY > 240) {
            doc.addPage();
            finalY = 20;
          }
          
          doc.setFillColor(241, 245, 249);
          doc.rect(15, finalY - 5, pageWidth - 30, 10, 'F');
          doc.setFontSize(10);
          doc.setTextColor(15, 23, 42);
          doc.setFont(undefined, 'bold');
          doc.text(`${customer.name.toUpperCase()} (Balance: ${formatPDFCurrency(customer.balance || 0)})`, 18, finalY + 1.5);
          doc.setFont(undefined, 'normal');
          
          const custTableData = catTxs.map(tx => [
            tx.date,
            tx.category || 'General',
            tx.description || '-',
            tx.type === 'in' ? `+${formatPDFCurrency(tx.amount)}` : `-${formatPDFCurrency(tx.amount)}`
          ]);

          autoTable(doc, {
            startY: finalY + 8,
            head: [['Date', 'Category', 'Description', 'Amount']],
            body: custTableData,
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [71, 85, 105] },
            columnStyles: {
              3: { halign: 'right', fontStyle: 'bold' }
            },
            didParseCell: (data) => {
              if (data.section === 'body' && data.column.index === 3) {
                const val = data.cell.text[0];
                if (val.startsWith('+')) data.cell.styles.textColor = [5, 150, 105];
                if (val.startsWith('-')) data.cell.styles.textColor = [220, 38, 38];
              }
            }
          });

          finalY = (doc as any).lastAutoTable.finalY + 20;
        }
      });

      // Footer logic for all pages
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
      }

      finalY = (doc as any).lastAutoTable.finalY + 30;
      
      // Signature boxes
      if (finalY < doc.internal.pageSize.height - 50) {
        doc.setDrawColor(226, 232, 240);
        doc.line(15, finalY, 75, finalY);
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text("AUTHORISED SIGNATORY", 15, finalY + 5);
        
        doc.line(pageWidth - 75, finalY, pageWidth - 15, finalY);
        doc.text("AUDITOR'S SEAL", pageWidth - 75, finalY + 5);
      }

      const fileName = `CashFlow_Statement_${new Date().toISOString().split('T')[0]}.pdf`;

      if (shareMode) {
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        await handleDirectShare(pdfBase64, fileName, 'application/pdf');
      } else {
        doc.save(fileName);
      }
    } catch (error) {
      console.error("PDF Export Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectShare = async (content: string, fileName: string, mimeType: string) => {
    try {
      // 1. Check if Google Drive is connected
      const statusRes = await fetch('/api/auth/google/status');
      const { connected } = await statusRes.json();

      if (!connected) {
        alert("⚠️ Google Drive not connected!\n\nPlease go to settings and tap 'Connect Google Drive' first so the app can create a sharing link for you.");
        setLoading(false);
        return;
      }

      setDeliveryProgress({ step: 'Generating sharing link...', status: 'loading' });

      const uploadRes = await fetch('/api/reports/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          content,
          mimeType,
          folders: ['Shared Reports']
        })
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(errorData.error || 'Server error during upload');
      }
      
      const { results } = await uploadRes.json();
      const link = results[0].link;

      // 2. Open WhatsApp
      const totalIn = transactions.filter(t => t.type === 'in').reduce((acc, t) => acc + t.amount, 0);
      const totalOut = transactions.filter(t => t.type === 'out').reduce((acc, t) => acc + t.amount, 0);
      const balance = totalIn - totalOut;

      const msg = encodeURIComponent(
        `📁 *FULL REPORT READY* 📁\n\n` +
        `Hello, here is the full Business Report for *${new Date().toLocaleDateString()}*.\n\n` +
        `💰 *Quick Summary:*\n` +
        `🟢 Total In: ${formatCurrency(totalIn)}\n` +
        `🔴 Total Out: ${formatCurrency(totalOut)}\n` +
        `🏦 Balance: ${formatCurrency(balance)}\n\n` +
        `🔗 *Download Full File:*\n${link}\n\n` +
        `_Generated via CashFlow Manager_`
      );

      const waNumber = automationStatus?.waNumber1 || '';
      const cleanedNumber = cleanPhoneNumber(waNumber);
      
      setDeliveryProgress({ step: 'Success! Opening WhatsApp...', status: 'success' });
      setTimeout(() => setDeliveryProgress(null), 1500);

      window.open(`https://wa.me/${cleanedNumber}?text=${msg}`, '_blank');
    } catch (error: any) {
      console.error("Share error:", error);
      setDeliveryProgress({ step: 'Sharing Failed', status: 'error' });
      alert(`❌ Share Failed: ${error.message || 'Unknown error'}\n\nPlease ensure your internet is working and Google Drive is connected.`);
      setTimeout(() => setDeliveryProgress(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const exportCustomerLedger = async (customerId: string, format: 'excel' | 'pdf', shareMode = false) => {
    if (customerId === 'all') {
      await exportAllCustomersLedger(format, shareMode);
      return;
    }

    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    setLoading(true);
    const customerTransactions = transactions.filter(t => t.customerId === customerId);
    const fileName = `${customer.name}_Ledger_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    
    try {
      if (format === 'excel') {
        const data = customerTransactions.map(tx => ({
          Date: tx.date,
          Type: tx.type.toUpperCase(),
          Category: tx.category || 'General',
          Description: tx.description,
          'Amount In': tx.type === 'in' ? tx.amount : 0,
          'Amount Out': tx.type === 'out' ? tx.amount : 0,
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Ledger");
        
        if (shareMode) {
          const excelBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
          await handleCustomerShare(excelBase64, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', customer);
        } else {
          XLSX.writeFile(wb, fileName);
        }
      } else {
        const doc = new jsPDF();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("CUSTOMER LEDGER", 14, 20);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.text(`Customer: ${customer.name}`, 14, 30);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 37);
        doc.setFont("helvetica", "bold");
        doc.text(`Current Balance: ${formatPDFCurrency(customer.balance || 0)}`, 14, 44);
        doc.setFont("helvetica", "normal");

        const tableData = customerTransactions.map(tx => [
          tx.date,
          tx.type.toUpperCase(),
          tx.category || 'General',
          tx.description || '-',
          tx.type === 'in' ? formatPDFCurrency(tx.amount) : '-',
          tx.type === 'out' ? formatPDFCurrency(tx.amount) : '-'
        ]);

        autoTable(doc, {
          startY: 55,
          head: [['Date', 'Type', 'Category', 'Description', 'Cash In', 'Cash Out']],
          body: tableData,
          styles: { fontSize: 10, cellPadding: 3 },
          headStyles: { fillColor: [15, 23, 42] }
        });

        if (shareMode) {
          const pdfBase64 = doc.output('datauristring').split(',')[1];
          await handleCustomerShare(pdfBase64, fileName, 'application/pdf', customer);
        } else {
          doc.save(fileName);
        }
      }
    } catch (error) {
      console.error("Ledger Export Error:", error);
    } finally {
      setLoading(false);
      if (!shareMode) setShowLedgerModal(false);
    }
  };

  const exportAllCustomersLedger = async (format: 'excel' | 'pdf', shareMode = false) => {
    setLoading(true);
    const fileName = `All_Customers_Consolidated_Ledger_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'pdf'}`;

    try {
      if (format === 'excel') {
        const wb = XLSX.utils.book_new();
        
        // Overview Sheet
        const summaryData = customers.map(c => ({
          'Customer Name': c.name,
          'Phone': c.phone || '',
          'In': c.totalIn || 0,
          'Out': c.totalOut || 0,
          'Balance': c.balance || 0
        }));
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Consolidated Summary");

        // Individual Sheets
        customers.forEach(customer => {
          const catTxs = transactions.filter(t => t.customerId === customer.id);
          if (catTxs.length > 0) {
            const data = catTxs.map(tx => ({
              Date: tx.date,
              Type: tx.type.toUpperCase(),
              Category: tx.category || 'General',
              Description: tx.description,
              'In': tx.type === 'in' ? tx.amount : 0,
              'Out': tx.type === 'out' ? tx.amount : 0,
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            // Sheet name max 31 chars
            const sheetName = customer.name.substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
          }
        });

        if (shareMode) {
          const excelBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
          await handleDirectShare(excelBase64, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        } else {
          XLSX.writeFile(wb, fileName);
        }
      } else {
        const doc = new jsPDF();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text("ALL CUSTOMERS - CONSOLIDATED LEDGER", 14, 20);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

        let finalY = 35;

        // Summary Table First
        const summaryTableData = customers.map(c => [
          c.name,
          c.phone || '-',
          formatPDFCurrency(c.totalIn || 0),
          formatPDFCurrency(c.totalOut || 0),
          formatPDFCurrency(c.balance || 0)
        ]);

        autoTable(doc, {
          startY: finalY,
          head: [['Customer', 'Phone', 'Total In', 'Total Out', 'Balance']],
          body: summaryTableData,
          headStyles: { fillColor: [15, 23, 42], fontStyle: 'bold' },
          bodyStyles: { fontSize: 10, cellPadding: 3 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right', fontStyle: 'bold' }
          }
        });

        finalY = (doc as any).lastAutoTable.finalY + 20;

        // Detailed sections
        customers.forEach((customer, index) => {
          const catTxs = transactions.filter(t => t.customerId === customer.id);
          if (catTxs.length > 0) {
            if (finalY > 240) {
              doc.addPage();
              finalY = 20;
            }
            
            doc.setFillColor(241, 245, 249);
            doc.rect(14, finalY - 5, pageWidth - 28, 10, 'F');
            doc.setFontSize(12);
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.text(`${customer.name.toUpperCase()} - ACCOUNT STATEMENT`, 17, finalY + 1.5);
            doc.setFont("helvetica", "normal");
            
            const tableData = catTxs.map(tx => [
              tx.date,
              tx.category || 'General',
              tx.description || '-',
              tx.type === 'in' ? formatPDFCurrency(tx.amount) : '-',
              tx.type === 'out' ? formatPDFCurrency(tx.amount) : '-'
            ]);

            autoTable(doc, {
              startY: finalY + 8,
              head: [['Date', 'Category', 'Description', 'In (+)', 'Out (-)']],
              body: tableData,
              styles: { fontSize: 9, cellPadding: 2 },
              headStyles: { fillColor: [71, 85, 105] },
              columnStyles: {
                3: { halign: 'right', textColor: [5, 150, 105] },
                4: { halign: 'right', textColor: [220, 38, 38] }
              }
            });

            finalY = (doc as any).lastAutoTable.finalY + 20;
          }
        });

        if (shareMode) {
          const pdfBase64 = doc.output('datauristring').split(',')[1];
          await handleDirectShare(pdfBase64, fileName, 'application/pdf');
        } else {
          doc.save(fileName);
        }
      }
    } catch (error) {
      console.error("All Ledger Export Error:", error);
    } finally {
      setLoading(false);
      if (!shareMode) setShowLedgerModal(false);
    }
  };

  const handleCustomerShare = async (content: string, fileName: string, mimeType: string, customer: any) => {
    // Check if Google Drive is connected
    const statusRes = await fetch('/api/auth/google/status');
    const { connected } = await statusRes.json();

    if (!connected) {
      alert("⚠️ Google Drive not connected!\n\nPlease go to settings and tap 'Connect Google Drive' first.");
      return;
    }

    setDeliveryProgress({ step: `Sharing ${customer.name}'s Ledger...`, status: 'loading' });

    try {
      const uploadRes = await fetch('/api/reports/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          content,
          mimeType,
          folders: [`Ledgers/${customer.name}`]
        })
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const { results } = await uploadRes.json();
      const link = results[0].link;

      const msg = encodeURIComponent(
        `📄 *CUSTOMER LEDGER REPORT* 📄\n\n` +
        `Hello *${customer.name}*,\n\n` +
        `Here is your account ledger summary as of *${new Date().toLocaleDateString()}*.\n\n` +
        `💰 *Outstanding Balance:* ${formatCurrency(customer.balance || 0)}\n\n` +
        `🔗 *Download Detailed Statement:*\n${link}\n\n` +
        `_Sent via CashFlow Manager_`
      );

      const cleanedNumber = cleanPhoneNumber(customer.phone || '');
      setDeliveryProgress({ step: 'Success! Opening WhatsApp...', status: 'success' });
      setTimeout(() => setDeliveryProgress(null), 1500);
      setShowLedgerModal(false);

      window.open(`https://wa.me/${cleanedNumber}?text=${msg}`, '_blank');
    } catch (error: any) {
      console.error("Ledger share error:", error);
      setDeliveryProgress({ step: 'Sharing Failed', status: 'error' });
      setTimeout(() => setDeliveryProgress(null), 3000);
    }
  };

  const processAutomatedDelivery = async () => {
    if (!automationStatus) return;
    setLoading(true);
    setDeliveryProgress({ step: 'Generating Reports...', status: 'loading' });

    try {
      // Logic for 3 WhatsApps
      const recipients = [
        automationStatus.waNumber1,
        automationStatus.waNumber2,
        automationStatus.waNumber3
      ].filter(n => !!n);

      // Logic for 3 Drive Paths
      const drivePaths = [
        automationStatus.drivePath1,
        automationStatus.drivePath2,
        automationStatus.drivePath3
      ].filter(p => !!p);

      // Real Drive Upload
      if (drivePaths.length > 0) {
        setDeliveryProgress({ step: 'Uploading to Google Drive...', status: 'loading' });
        
        // Prepare Excel
        const transactionData = transactions.map(tx => ({
          Date: tx.date,
          Customer: getCustomerName(tx.customerId),
          Type: tx.type.toUpperCase(),
          Category: tx.category || 'General',
          Amount: tx.amount,
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(transactionData);
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
        const excelBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

        const uploadRes = await fetch('/api/reports/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: `FlowReport_${new Date().toISOString().split('T')[0]}.xlsx`,
            content: excelBase64,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            folders: drivePaths
          })
        });

        if (!uploadRes.ok) {
          throw new Error('Drive upload failed');
        }
      }

      setDeliveryProgress({ step: 'Sharing to WhatsApp Recipients...', status: 'loading' });
      await new Promise(r => setTimeout(r, 600));

      // Trigger actual downloads
      exportToExcel();
      exportToPDF();

      setDeliveryProgress({ step: 'Reports Ready for Download!', status: 'success' });
      
      // If we have recipients, generate one link for the first one as a demo
      if (recipients.length > 0) {
        const totalIn = transactions.filter(t => t.type === 'in').reduce((a, b) => a + b.amount, 0);
        const totalOut = transactions.filter(t => t.type === 'out').reduce((a, b) => a + b.amount, 0);
        const balance = totalIn - totalOut;

        const cleanedNumber = cleanPhoneNumber(recipients[0]);
        const msg = encodeURIComponent(
          `📁 *REPORT DELIVERY SUCCESSFUL* 📁\n\n` +
          `Hello, here is the Daily Business Summary for *${new Date().toLocaleDateString()}*.\n\n` +
          `💰 *Financial Overview:*\n` +
          `🟢 Total Cash In: ${formatCurrency(totalIn)}\n` +
          `🔴 Total Cash Out: ${formatCurrency(totalOut)}\n` +
          `🏦 Net Balance: ${formatCurrency(balance)}\n\n` +
          `✅ *Storage Status:*\n` +
          `📂 Excel/PDF exported and uploaded to Google Drive paths (${drivePaths.length}).\n\n` +
          `_Powered by CashFlow Manager_`
        );
        window.open(`https://wa.me/${cleanedNumber}?text=${msg}`, '_blank');
      }

    } catch (error) {
      setDeliveryProgress({ step: 'Automation Failed', status: 'error' });
    } finally {
      setLoading(false);
      setTimeout(() => setDeliveryProgress(null), 3000);
    }
  };

  return (
    <div className="p-6 space-y-12 max-w-4xl mx-auto pb-32">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Reporting Center</h2>
        <p className="text-slate-500 font-medium font-serif italic">Clean & Professional Financial Statements</p>
      </div>

      {/* Date Filter Card */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/50 space-y-6">
        <div className="flex items-center gap-3 px-2">
          <Filter className="w-5 h-5 text-indigo-600" />
          <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400">Select Report Period</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">From Date</label>
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full p-5 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-inner"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">To Date</label>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full p-5 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-inner"
            />
          </div>
        </div>
      </div>

      {/* Export Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => exportToPDF(false)}
          disabled={loading}
          className="bg-slate-900 p-10 rounded-[48px] text-white shadow-2xl flex flex-col items-center gap-6 group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-[0.05] rotate-12 group-hover:rotate-45 transition-transform duration-700">
            <FileDown className="w-48 h-48" />
          </div>
          <div className="p-5 bg-white/10 rounded-3xl shadow-inner text-indigo-400">
            <FileDown className="w-10 h-10" />
          </div>
          <div className="text-center relative z-10">
            <h4 className="text-xl font-black uppercase tracking-tight">Download PDF</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Includes Customer-wise Ledger</p>
          </div>
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => exportToExcel(false)}
          disabled={loading}
          className="bg-emerald-600 p-10 rounded-[48px] text-white shadow-2xl flex flex-col items-center gap-6 group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-[0.1] -rotate-12 group-hover:-rotate-45 transition-transform duration-700">
            <FileSpreadsheet className="w-48 h-48" />
          </div>
          <div className="p-5 bg-white/20 rounded-3xl shadow-inner text-white">
            <FileSpreadsheet className="w-10 h-10" />
          </div>
          <div className="text-center relative z-10">
            <h4 className="text-xl font-black uppercase tracking-tight">Download Excel</h4>
            <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-2">All Customer Sheets (XLSX)</p>
          </div>
        </motion.button>
      </div>

      {/* Summary Footer */}
      <div className="bg-slate-50 p-8 rounded-[40px] border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex gap-12">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Flow</p>
            <p className="text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(stats.balance)}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Entries</p>
            <p className="text-2xl font-black text-slate-900 tracking-tight">{stats.count}</p>
          </div>
        </div>
        <button 
          onClick={() => setShowLedgerModal(true)}
          className="text-xs font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700 transition underline underline-offset-8"
        >
          Select Single Customer Statement
        </button>
      </div>


      <AnimatePresence>
        {showLedgerModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[150] flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900 uppercase tracking-tight">SELECT CUSTOMER</h3>
                <button onClick={() => setShowLedgerModal(false)} className="bg-gray-100 p-2 rounded-xl text-gray-400 hover:text-gray-600 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Target Statement</label>
                  <div className="relative group">
                    <select 
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full p-5 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 appearance-none shadow-inner"
                    >
                      <option value="">Select a customer...</option>
                      <option value="all" className="font-bold text-blue-600">📊 ALL CUSTOMERS (CONSOLIDATED LIBRARY)</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 pointer-events-none group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <button
                    disabled={!selectedCustomerId || loading}
                    onClick={() => exportCustomerLedger(selectedCustomerId, 'excel', false)}
                    className="w-full flex flex-col items-center gap-3 p-6 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-[32px] hover:bg-emerald-100 transition disabled:opacity-50 group"
                  >
                    <FileSpreadsheet className="w-8 h-8 group-hover:scale-110 transition" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Excel</span>
                  </button>

                  <button
                    disabled={!selectedCustomerId || loading}
                    onClick={() => exportCustomerLedger(selectedCustomerId, 'pdf', false)}
                    className="w-full flex flex-col items-center gap-3 p-6 bg-blue-50 text-blue-700 border border-blue-100 rounded-[32px] hover:bg-blue-100 transition disabled:opacity-50 group"
                  >
                    <FileDown className="w-8 h-8 group-hover:scale-110 transition" />
                    <span className="text-[10px] font-black uppercase tracking-widest">PDF Export</span>
                  </button>
                </div>

                <div className="flex gap-4">
                  <button
                    disabled={!selectedCustomerId || loading}
                    onClick={() => exportCustomerLedger(selectedCustomerId, 'excel', true)}
                    className="w-1/2 py-4 bg-emerald-600 text-white rounded-2xl flex items-center justify-center gap-2 text-xs font-black shadow-lg shadow-emerald-100 active:scale-95 transition disabled:opacity-50 uppercase tracking-widest"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Share Excel
                  </button>
                  <button
                    disabled={!selectedCustomerId || loading}
                    onClick={() => exportCustomerLedger(selectedCustomerId, 'pdf', true)}
                    className="w-1/2 py-4 bg-blue-600 text-white rounded-2xl flex items-center justify-center gap-2 text-xs font-black shadow-lg shadow-blue-100 active:scale-95 transition disabled:opacity-50 uppercase tracking-widest"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Share PDF
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {loading && !deliveryProgress && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[100] flex items-center justify-center">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex items-center gap-6 border border-gray-100">
            <div className="relative">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <div className="absolute inset-0 border-4 border-blue-100 border-t-transparent rounded-full" />
            </div>
            <div>
              <p className="font-black text-gray-900 tracking-tight">ENGINEERING REPORT</p>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Compiling master statement...</p>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {deliveryProgress && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[48px] p-10 text-center space-y-8 shadow-2xl border border-white/20"
            >
              {deliveryProgress.status === 'loading' ? (
                <div className="w-24 h-24 bg-blue-50 relative mx-auto rounded-full flex items-center justify-center">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                  <div className="absolute inset-0 border-[6px] border-blue-100 border-t-blue-600 rounded-full animate-spin-slow" />
                </div>
              ) : deliveryProgress.status === 'success' ? (
                <div className="w-24 h-24 bg-emerald-100 mx-auto rounded-full flex items-center justify-center text-emerald-600 scale-110 shadow-lg shadow-emerald-50">
                  <Database className="w-12 h-12" />
                </div>
              ) : (
                <div className="w-24 h-24 bg-red-100 mx-auto rounded-full flex items-center justify-center text-red-600">
                  <X className="w-12 h-12" />
                </div>
              )}

              <div className="space-y-3">
                <h4 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">Cloud Automation</h4>
                <div className="h-1 w-12 bg-blue-500 mx-auto rounded-full" />
                <p className={cn(
                  "text-sm font-bold tracking-tight px-4",
                  deliveryProgress.status === 'success' ? "text-emerald-600" : "text-gray-500"
                )}>
                  {deliveryProgress.step}
                </p>
              </div>

              {deliveryProgress.status === 'success' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-2 gap-4 pt-4"
                >
                  <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">WhatsApp</p>
                    <p className="text-sm font-black text-gray-900">MASTER SENT</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">G-Drive</p>
                    <p className="text-sm font-black text-gray-900">STORED</p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
