import React, { Component } from 'react';

// Mock Player for UI Development
interface PlayerProps {
    className?: string;
    url?: string;
}

export default class Player extends Component<PlayerProps> {
    render() {
        return (
            <div className={this.props.className} style={{
                background: 'transparent', // Let App background show through
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                color: 'rgba(255,255,255,0.5)',
                fontFamily: 'Inter, sans-serif'
            }}>
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    backdropFilter: 'blur(0px)'
                }}>
                    <h2 style={{
                        color: '#fff',
                        fontSize: '2rem',
                        fontWeight: 200,
                        letterSpacing: '4px',
                        textTransform: 'uppercase',
                        marginBottom: '0.5rem',
                        textShadow: '0 0 20px rgba(255,255,255,0.5)'
                    }}>Nautic</h2>
                    <div style={{
                        height: '1px',
                        width: '40px',
                        background: 'rgba(255,255,255,0.3)',
                        margin: '0 auto 1.5rem auto'
                    }}></div>
                    <p style={{ fontSize: '0.9rem', letterSpacing: '1px' }}>DROP FILE OR URL</p>
                </div>
            </div>
        );
    }
}
