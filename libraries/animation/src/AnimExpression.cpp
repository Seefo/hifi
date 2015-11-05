//
//  AnimExpression.cpp
//
//  Created by Anthony J. Thibault on 11/1/15.
//  Copyright (c) 2015 High Fidelity, Inc. All rights reserved.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//

#include <StreamUtils.h>
#include <QRegExp>

#include "AnimExpression.h"
#include "AnimationLogging.h"

AnimExpression::AnimExpression(const QString& str) :
    _expression(str) {
    auto iter = str.begin();
    parseExpression(_expression, iter);
}

void AnimExpression::unconsumeToken(const Token& token) {
    _tokenStack.push(token);
}

AnimExpression::Token AnimExpression::consumeToken(const QString& str, QString::const_iterator& iter) const {
    if (!_tokenStack.empty()) {
        Token top = _tokenStack.top();
        _tokenStack.pop();
        return top;
    } else {
        while (iter != str.end()) {
            if (iter->isSpace()) {
                ++iter;
            } else if (iter->isLetter()) {
                return consumeIdentifier(str, iter);
            } else if (iter->isDigit()) {
                return consumeNumber(str, iter);
            } else {
                switch (iter->unicode()) {
                case '&': return consumeAnd(str, iter);
                case '|': return consumeOr(str, iter);
                case '>': return consumeGreaterThan(str, iter);
                case '<': return consumeLessThan(str, iter);
                case '(': ++iter; return Token(Token::LeftParen);
                case ')': ++iter; return Token(Token::RightParen);
                case '!': return consumeNot(str, iter);
                case '-': ++iter; return Token(Token::Minus);
                case '+': ++iter; return Token(Token::Plus);
                case '*': ++iter; return Token(Token::Multiply);
                case '%': ++iter; return Token(Token::Modulus);
                case ',': ++iter; return Token(Token::Comma);
                default:
                    qCCritical(animation) << "AnimExpression: unexpected char" << *iter << "at index " << (int)(iter - str.begin());
                    return Token(Token::Error);
                }
            }
        }
        return Token(Token::End);
    }
}

AnimExpression::Token AnimExpression::consumeIdentifier(const QString& str, QString::const_iterator& iter) const {
    assert(iter != str.end());
    assert(iter->isLetter());
    auto begin = iter;
    while ((iter->isLetter() || iter->isDigit()) && iter != str.end()) {
        ++iter;
    }
    int pos = (int)(begin - str.begin());
    int len = (int)(iter - begin);
    return Token(QStringRef(const_cast<const QString*>(&str), pos, len));
}

// TODO: not very efficient or accruate, but it's close enough for now.
static float computeFractionalPart(int fractionalPart)
{
    float frac = (float)fractionalPart;
    while (fractionalPart) {
        fractionalPart /= 10;
        frac /= 10.0f;
    }
    return frac;
}

static float computeFloat(int whole, int fraction) {
    return (float)whole + computeFractionalPart(fraction);
}

AnimExpression::Token AnimExpression::consumeNumber(const QString& str, QString::const_iterator& iter) const {
    assert(iter != str.end());
    assert(iter->isDigit());
    auto begin = iter;
    while (iter->isDigit() && iter != str.end()) {
        ++iter;
    }

    // parse whole integer part
    int pos = (int)(begin - str.begin());
    int len = (int)(iter - begin);
    QString sub = QStringRef(const_cast<const QString*>(&str), pos, len).toString();
    int whole = sub.toInt();

    // parse optional fractional part
    if (iter->unicode() == '.') {
        iter++;
        auto begin = iter;
        while (iter->isDigit() && iter != str.end()) {
            ++iter;
        }

        int pos = (int)(begin - str.begin());
        int len = (int)(iter - begin);
        QString sub = QStringRef(const_cast<const QString*>(&str), pos, len).toString();
        int fraction = sub.toInt();

        return Token(computeFloat(whole, fraction));

    } else {
        return Token(whole);
    }
}

AnimExpression::Token AnimExpression::consumeAnd(const QString& str, QString::const_iterator& iter) const {
    assert(iter != str.end());
    assert(iter->unicode() == '&');
    iter++;
    if (iter->unicode() == '&') {
        iter++;
        return Token(Token::And);
    } else {
        qCCritical(animation) << "AnimExpression: unexpected char" << *iter << "at index " << (int)(iter - str.begin());
        return Token(Token::Error);
    }
}

AnimExpression::Token AnimExpression::consumeOr(const QString& str, QString::const_iterator& iter) const {
    assert(iter != str.end());
    assert(iter->unicode() == '|');
    iter++;
    if (iter->unicode() == '|') {
        iter++;
        return Token(Token::Or);
    } else {
        qCCritical(animation) << "AnimExpression: unexpected char" << *iter << "at index " << (int)(iter - str.begin());
        return Token(Token::Error);
    }
}

AnimExpression::Token AnimExpression::consumeGreaterThan(const QString& str, QString::const_iterator& iter) const {
    assert(iter != str.end());
    assert(iter->unicode() == '>');
    iter++;
    if (iter->unicode() == '=') {
        iter++;
        return Token(Token::GreaterThanEqual);
    } else {
        return Token(Token::GreaterThan);
    }
}

AnimExpression::Token AnimExpression::consumeLessThan(const QString& str, QString::const_iterator& iter) const {
    assert(iter != str.end());
    assert(iter->unicode() == '<');
    iter++;
    if (iter->unicode() == '=') {
        iter++;
        return Token(Token::LessThanEqual);
    } else {
        return Token(Token::LessThan);
    }
}

AnimExpression::Token AnimExpression::consumeNot(const QString& str, QString::const_iterator& iter) const {
    assert(iter != str.end());
    assert(iter->unicode() == '!');
    iter++;
    if (iter->unicode() == '=') {
        iter++;
        return Token(Token::NotEqual);
    } else {
        return Token(Token::Not);
    }
}

bool AnimExpression::parseExpression(const QString& str, QString::const_iterator& iter) {
    auto token = consumeToken(str, iter);
    if (token.type == Token::Identifier) {
        if (token.strVal == "true") {
            _opCodes.push_back(OpCode {true});
        } else if (token.strVal == "false") {
            _opCodes.push_back(OpCode {false});
        } else {
            _opCodes.push_back(OpCode {token.strVal});
        }
        return true;
    } else if (token.type == Token::Int) {
        _opCodes.push_back(OpCode {token.intVal});
        return true;
    } else if (token.type == Token::Float) {
        _opCodes.push_back(OpCode {token.floatVal});
        return true;
    } else if (token.type == Token::LeftParen) {
        if (parseUnaryExpression(str, iter)) {
            token = consumeToken(str, iter);
            if (token.type != Token::RightParen) {
                qCCritical(animation) << "Error parsing expression, expected ')'";
                return false;
            } else {
                return true;
            }
        } else {
            return false;
        }
    } else {
        qCCritical(animation) << "Error parsing expression, unexpected symbol";
        return false;
    }
}

bool AnimExpression::parseUnaryExpression(const QString& str, QString::const_iterator& iter) {
    auto token = consumeToken(str, iter);
    if (token.type == Token::Plus) {
        if (parseExpression(str, iter)) {
            _opCodes.push_back(OpCode {OpCode::UnaryPlus});
            return true;
        } else {
            return false;
        }
    } else if (token.type == Token::Minus) {
        if (parseExpression(str, iter)) {
            _opCodes.push_back(OpCode {OpCode::UnaryMinus});
            return true;
        } else {
            return false;
        }
    } else if (token.type == Token::Not) {
        if (parseExpression(str, iter)) {
            _opCodes.push_back(OpCode {OpCode::Not});
            return true;
        } else {
            return false;
        }
    } else {
        unconsumeToken(token);
        return parseExpression(str, iter);
    }
}

AnimExpression::OpCode AnimExpression::evaluate(const AnimVariantMap& map) const {
    std::stack<OpCode> stack;
    for (auto& opCode : _opCodes) {
        switch (opCode.type) {
        case OpCode::Identifier:
        case OpCode::Int:
        case OpCode::Float:
            stack.push(opCode);
            break;
        default:
            switch (opCode.type) {
            case OpCode::Not:
                evalNot(map, stack);
                break;
            }
        }
    }
    return stack.top();
}

void AnimExpression::evalNot(const AnimVariantMap& map, std::stack<OpCode>& stack) const {
    bool lhs = stack.top().coerceBool(map);
    stack.pop();
    stack.push(OpCode {!lhs});
}
